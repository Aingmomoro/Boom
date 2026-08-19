// gameState.js
// จัดการ Room, Player role (A/B), Timer, Strike, Bomb state

const { generateBomb, sanitizeModuleForClient } = require('./bombGenerator');

const MAX_STRIKES = 3;
const ROUND_SECONDS = 5 * 60; // 5:00
const RECONNECT_GRACE_MS = 15 * 1000; // 15 วินาที

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeRoomCode() {
  let code;
  do {
    code = String(randInt(100000, 999999));
  } while (rooms.has(code));
  return code;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = { A: null, B: null }; // { ws, connected, disconnectTimer }
    this.status = 'waiting'; // waiting -> ready -> playing -> defused | exploded
    this.strikes = 0;
    this.maxStrikes = MAX_STRIKES;
    this.timeRemaining = ROUND_SECONDS;
    this.bomb = null;
    this.tickInterval = null;
    this.readyFlags = { A: false, B: false };
  }

  assignRole(ws) {
    if (!this.players.A) {
      this.players.A = { ws, connected: true, disconnectTimer: null };
      return 'A';
    }
    if (!this.players.B) {
      this.players.B = { ws, connected: true, disconnectTimer: null };
      return 'B';
    }
    return null; // ห้องเต็ม
  }

  bothConnected() {
    return this.players.A?.connected && this.players.B?.connected;
  }

  bothReady() {
    return this.readyFlags.A && this.readyFlags.B;
  }

  startRound() {
    this.status = 'playing';
    this.strikes = 0;
    this.timeRemaining = ROUND_SECONDS;
    this.bomb = generateBomb();

    this.tickInterval = setInterval(() => {
      if (this.status !== 'playing') return;
      this.timeRemaining -= 1;
      this.broadcastTimer();
      if (this.timeRemaining <= 0) {
        this.endRound('exploded', 'timeout');
      }
    }, 1000);
  }

  endRound(status, reason) {
    this.status = status; // 'defused' | 'exploded'
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
    this.broadcast({
      type: 'game_over',
      status,
      reason,
      timeRemaining: this.timeRemaining,
      strikes: this.strikes,
    });
  }

  registerStrike() {
    this.strikes += 1;
    this.broadcast({ type: 'strike', strikes: this.strikes, maxStrikes: this.maxStrikes });
    if (this.strikes >= this.maxStrikes) {
      this.endRound('exploded', 'max_strikes');
    }
  }

  checkAllModulesSolved() {
    if (this.bomb.modules.every((m) => m.solved)) {
      this.endRound('defused', 'all_modules_solved');
    }
  }

  broadcastTimer() {
    this.broadcast({ type: 'timer_tick', timeRemaining: this.timeRemaining });
  }

  broadcast(payload, excludeRole) {
    const msg = JSON.stringify(payload);
    for (const role of ['A', 'B']) {
      if (role === excludeRole) continue;
      const p = this.players[role];
      if (p?.connected && p.ws.readyState === 1) p.ws.send(msg);
    }
  }

  sendTo(role, payload) {
    const p = this.players[role];
    if (p?.connected && p.ws.readyState === 1) p.ws.send(JSON.stringify(payload));
  }

  // สถานะสำหรับส่งให้ client ตอน join / reconnect (แยกตาม role)
  publicStateFor(role) {
    const base = {
      type: 'room_state',
      code: this.code,
      role,
      status: this.status,
      strikes: this.strikes,
      maxStrikes: this.maxStrikes,
      timeRemaining: this.timeRemaining,
      readyFlags: this.readyFlags,
    };
    if (this.bomb && role === 'A') {
      base.modules = this.bomb.modules.map(sanitizeModuleForClient);
    }
    // Player B ไม่ได้รับ visibleState ของระเบิดเลย (เห็นแค่คู่มือ static ฝั่ง client เอง)
    return base;
  }
}

function createRoom() {
  const code = makeRoomCode();
  const room = new Room(code);
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(code);
}

function removeRoomIfEmpty(room) {
  const aGone = !room.players.A || !room.players.A.connected;
  const bGone = !room.players.B || !room.players.B.connected;
  if (aGone && bGone) {
    if (room.tickInterval) clearInterval(room.tickInterval);
    rooms.delete(room.code);
  }
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  removeRoomIfEmpty,
  RECONNECT_GRACE_MS,
};
