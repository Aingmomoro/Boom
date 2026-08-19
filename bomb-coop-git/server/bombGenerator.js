// bombGenerator.js
// สร้างระเบิดแบบสุ่มสำหรับ Prototype v0.1: มีแค่ Wire Module + Button Module
// Server เป็นคนสุ่มและเก็บ "คำตอบที่ถูกต้อง" ไว้ฝั่งเดียว
// - Player A (Bomb Handler) จะได้รับเฉพาะข้อมูล "ที่มองเห็นได้" (สี/ลำดับ/ข้อความ) ไม่ได้รับคำตอบ
// - Player B (Expert) จะได้รับ "คู่มือ" (manual) ซึ่งเป็นกฎทั่วไป ไม่ใช่คำตอบของระเบิดลูกนี้โดยตรง
//   B ต้องอนุมานคำตอบจากคู่มือ + สิ่งที่ A อธิบายมาปากเปล่า (นอกเกม)

const WIRE_COLORS = ['red', 'blue', 'yellow', 'black', 'white'];
const BUTTON_COLORS = ['red', 'blue', 'yellow', 'white'];
const BUTTON_LABELS = ['DETONATE', 'ABORT', 'HOLD', 'PRESS'];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// --- Wire Module ---
// กฎ (จำลองสไตล์ KTANE แบบง่าย ใช้เป็น "คู่มือ" ที่ B เห็น):
// - ถ้ามีสายสีแดง 0 เส้น -> ตัดสายเส้นที่ 2
// - ถ้าสายเส้นสุดท้ายเป็นสีขาว -> ตัดสายเส้นสุดท้าย
// - ถ้ามีสายสีแดงมากกว่า 1 เส้น -> ตัดสายสีแดงเส้นสุดท้าย
// - ถ้าไม่เข้าเงื่อนไขใดเลย -> ตัดสายเส้นแรก
function generateWireModule() {
  const wireCount = randInt(3, 6);
  const wires = Array.from({ length: wireCount }, () => pick(WIRE_COLORS));

  let correctIndex;
  const redCount = wires.filter((c) => c === 'red').length;

  if (redCount === 0) {
    correctIndex = 1 % wireCount;
  } else if (wires[wireCount - 1] === 'white') {
    correctIndex = wireCount - 1;
  } else if (redCount > 1) {
    correctIndex = wires.lastIndexOf('red');
  } else {
    correctIndex = 0;
  }

  return {
    id: 'wire',
    type: 'wire',
    solved: false,
    // ข้อมูลที่ Player A เห็น (ไม่มีคำตอบ)
    visibleState: { wires },
    // คำตอบจริง เก็บฝั่ง server เท่านั้น ห้ามส่งให้ client โดยตรง
    _answer: { cutIndex: correctIndex },
  };
}

// --- Button Module ---
// กฎแบบง่าย:
// - ถ้าปุ่มสีแดง และข้อความ "DETONATE" -> ห้ามกด ต้อง "กดค้าง" แล้วปล่อยตอนวินาทีลงท้ายด้วย 5
// - ถ้าปุ่มสีน้ำเงิน -> กดทันที
// - อย่างอื่น -> กดค้าง 3 วินาทีแล้วปล่อย
function generateButtonModule() {
  const color = pick(BUTTON_COLORS);
  const label = pick(BUTTON_LABELS);

  let action;
  if (color === 'red' && label === 'DETONATE') {
    action = { type: 'hold_release_on_digit', digit: 5 };
  } else if (color === 'blue') {
    action = { type: 'tap' };
  } else {
    action = { type: 'hold_seconds', seconds: 3 };
  }

  return {
    id: 'button',
    type: 'button',
    solved: false,
    visibleState: { color, label },
    _answer: action,
  };
}

function generateBomb() {
  return {
    modules: [generateWireModule(), generateButtonModule()],
  };
}

// ส่งเฉพาะ field ที่ client ควรเห็น (ตัด _answer ออกเสมอ)
function sanitizeModuleForClient(mod) {
  return {
    id: mod.id,
    type: mod.type,
    solved: mod.solved,
    visibleState: mod.visibleState,
  };
}

module.exports = {
  generateBomb,
  sanitizeModuleForClient,
};
