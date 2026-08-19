// server.js
// Entry point: HTTP (health check for Render.com) + WebSocket server

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { createRoom, getRoom, removeRoomIfEmpty, RECONNECT_GRACE_MS } = require('./gameState');
const { sanitizeModuleForClient } = require('./bombGenerator');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

// เสิร์ฟไฟล์ client (index.html/style.css/client.js) + health check เดียวกัน
// ทำให้ deploy บน Render.com เป็น Web Service เดียว ไม่ต้องแยก static host
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(CLIENT_DIR, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('BOMB CO-OP server is running.');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return; // ignore malformed
    }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'create_room':
      return onCreateRoom(ws);
    case 'join_room':
      return onJoinRoom(ws, msg.code);
    case 'ready':
      return onReady(ws);
    case 'module_action':
      return onModuleAction(ws, msg);
    default:
      break;
  }
}

function onCreateRoom(ws) {
  const room = createRoom();
  const role = room.assignRole(ws);
  ws.roomCode = room.code;
  ws.role = role;
  ws.send(JSON.stringify({ type: 'room_created', code: room.code, role }));
  ws.send(JSON.stringify(room.publicStateFor(role)));
}

function onJoinRoom(ws, code) {
  const room = getRoom(code);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'ไม่พบห้องนี้ ตรวจสอบรหัสอีกครั้ง' }));
    return;
  }
  const role = room.assignRole(ws);
  if (!role) {
    ws.send(JSON.stringify({ type: 'error', message: 'ห้องเต็มแล้ว (2/2)' }));
    return;
  }
  ws.roomCode = room.code;
  ws.role = role;
  ws.send(JSON.stringify({ type: 'joined_room', code: room.code, role }));

  // แจ้งทั้งสองฝั่งด้วย state ล่าสุด (แยก payload ตาม role)
  room.sendTo('A', room.publicStateFor('A'));
  room.sendTo('B', room.publicStateFor('B'));
}

function onReady(ws) {
  const room = getRoom(ws.roomCode);
  if (!room || !ws.role) return;
  room.readyFlags[ws.role] = true;
  room.broadcast({ type: 'ready_update', readyFlags: room.readyFlags });

  if (room.bothReady() && room.status === 'waiting') {
    room.startRound();
    room.sendTo('A', { type: 'game_start', modules: room.bomb.modules.map(sanitizeModuleForClient) });
    room.sendTo('B', { type: 'game_start' }); // B ไม่ได้ modules state ของระเบิด
    room.broadcastTimer();
  }
}

// Player A ส่ง action มาที่ module (เช่น ตัดสายเส้นที่ index, กด/ปล่อยปุ่ม)
function onModuleAction(ws, msg) {
  const room = getRoom(ws.roomCode);
  if (!room || ws.role !== 'A' || room.status !== 'playing') return;

  const mod = room.bomb.modules.find((m) => m.id === msg.moduleId);
  if (!mod || mod.solved) return;

  const correct = evaluateAction(mod, msg.action);

  if (correct) {
    mod.solved = true;
    room.broadcast({ type: 'module_result', moduleId: mod.id, result: 'correct' });
    room.checkAllModulesSolved();
  } else {
    room.broadcast({ type: 'module_result', moduleId: mod.id, result: 'wrong' });
    room.registerStrike();
  }
}

function evaluateAction(mod, action) {
  if (mod.type === 'wire' && action.type === 'cut_wire') {
    return action.index === mod._answer.cutIndex;
  }
  if (mod.type === 'button') {
    const ans = mod._answer;
    if (ans.type === 'tap' && action.type === 'tap') return true;
    if (ans.type === 'hold_seconds' && action.type === 'hold_release' && action.heldSeconds >= ans.seconds) {
      return true;
    }
    if (ans.type === 'hold_release_on_digit' && action.type === 'hold_release' && action.releaseDigit === ans.digit) {
      return true;
    }
    return false;
  }
  return false;
}

function handleDisconnect(ws) {
  const room = getRoom(ws.roomCode);
  if (!room || !ws.role) return;

  const player = room.players[ws.role];
  if (!player) return;
  player.connected = false;

  room.broadcast({ type: 'peer_disconnected', role: ws.role, graceMs: RECONNECT_GRACE_MS }, ws.role);

  player.disconnectTimer = setTimeout(() => {
    if (!player.connected) {
      // หมด grace period แล้วยังไม่กลับมา -> จบรอบ (ไม่ตัดสินว่าเป็น exploded)
      if (room.status === 'playing') {
        room.endRound('exploded', 'peer_disconnected_timeout');
      }
      removeRoomIfEmpty(room);
    }
  }, RECONNECT_GRACE_MS);
}

server.listen(PORT, () => {
  console.log(`BOMB CO-OP server listening on port ${PORT}`);
});
