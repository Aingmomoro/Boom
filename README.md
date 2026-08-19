# 💣 BOMB CO-OP — Prototype v0.1

โครงสร้างโปรเจกต์:

```
bomb-coop/
├── server/
│   ├── server.js          # WebSocket server + serve client static files
│   ├── gameState.js       # Room / Timer / Strike / broadcast logic
│   ├── bombGenerator.js   # สุ่ม Bomb (Wire + Button module สำหรับ v0.1)
│   └── package.json
└── client/
    ├── index.html
    ├── style.css
    └── client.js
```

## รันทดสอบในเครื่อง

```bash
cd server
npm install
npm start
```

เปิด `http://localhost:3000` สองแท็บ (จำลอง Player A กับ B) — แท็บแรกกด "สร้างห้องใหม่" แท็บสองกรอกรหัสห้องเพื่อ "เข้าห้อง"

## Deploy ขึ้น Render.com (Free Tier)

1. Push โปรเจกต์นี้ขึ้น GitHub repo
2. บน [dashboard.render.com](https://dashboard.render.com) → **New → Web Service**
3. เชื่อม GitHub repo, ตั้งค่า:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Deploy เสร็จจะได้ URL เช่น `https://bomb-coop-server.onrender.com`
5. แก้ `client/client.js` บรรทัด `WS_URL` ถ้าจะแยก host client ออกจาก server ในอนาคต (ตอนนี้ server เสิร์ฟ client ให้ในตัว ไม่ต้องแก้อะไร)

> ⚠️ Free tier จะ **sleep** เมื่อไม่มีคน request เกิน ~15 นาที และตื่นช้า (cold start 30วิ–1นาที) — เพื่อนที่กด "เข้าห้อง" ครั้งแรกของวันอาจต้องรอสักครู่ก่อน connect ติด

## Message Schema (WebSocket)

### Client → Server
| type | payload | ใคร่งส่ง |
|---|---|---|
| `create_room` | `{}` | A หรือ B (คนแรก) |
| `join_room` | `{ code }` | คนที่สอง |
| `ready` | `{}` | ทั้งคู่ |
| `module_action` | `{ moduleId, action }` | เฉพาะ A |

### Server → Client
| type | payload | หมายเหตุ |
|---|---|---|
| `room_created` / `joined_room` | `{ code, role }` | ยืนยัน role ที่ได้รับ |
| `error` | `{ message }` | เช่น ห้องเต็ม/ไม่พบห้อง |
| `ready_update` | `{ readyFlags }` | |
| `game_start` | `{ modules }` (เฉพาะ A) | B ไม่ได้รับ modules เลย |
| `timer_tick` | `{ timeRemaining }` | ทุก 1 วิ |
| `strike` | `{ strikes, maxStrikes }` | |
| `module_result` | `{ moduleId, result }` | `correct` \| `wrong` |
| `peer_disconnected` | `{ role, graceMs }` | grace period 15 วิ |
| `game_over` | `{ status, reason, timeRemaining, strikes }` | `defused` \| `exploded` |

## Design Decisions ที่ยืนยันแล้ว

- **Strike System:** พลาดได้ 3 ครั้งก่อนระเบิด (ไม่ใช่ 1 ครั้งตายแบบ draft แรก)
- **Communication:** ไม่มีระบบเสียง/แชทในเกม ผู้เล่นคุยกันผ่านโปรแกรมนอก (Discord ฯลฯ)
- **Network:** Online ผ่าน WebSocket, deploy บน Render.com free tier แทน LAN local
- **Room Join:** ใช้รหัสห้อง 6 หลัก ผู้เล่นแชร์กันเอง
- **Client:** Vanilla JS + DOM (ไม่ใช้ Canvas) เพื่อความง่ายในการ debug ช่วง prototype
- **Reconnect:** grace period 15 วิ ถ้าเกินเวลานี้ยังไม่กลับมา → จบรอบ กลับ lobby (ไม่ตัดสินเป็น exploded ทันที)

## สิ่งที่ยังไม่ทำใน v0.1 (ตาม Roadmap เดิม)

- Switch / Code / Light / Logic module (v0.2–v0.3)
- ระบบสุ่มความหลากหลายของกฎ ไม่ใช่แค่ค่า (v0.4)
- คู่มือหลายรูปแบบ/หลายเวอร์ชันระเบิด (v0.5)
- Animation, polish UI (v0.6)
