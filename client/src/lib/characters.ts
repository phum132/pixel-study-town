import list from './characterList.json';

// ตัวละครจากชุด Ninja Adventure (CC0) ไฟล์อยู่ที่ public/assets/characters/<ชื่อ>.png และ <ชื่อ>-face.png
// characterList.json สร้างตอนคัดลอกภาพ (เฉพาะตัวที่เป็นแผ่นภาพมาตรฐาน 64x112)
//
// แผ่นภาพหนึ่งตัว: 4 คอลัมน์ = ทิศ (ลง ขึ้น ซ้าย ขวา), แถว 1-4 = ท่าเดิน, แถวที่เหลือ (โจมตี กระโดด) ไม่ได้ใช้
export const CHARACTERS: string[] = list;
export const DEFAULT_CHARACTER = 'Boy';

// ข้อมูลหน้าตาที่เก็บใน profiles.avatar
export type Avatar = { character: string };

export const DIR_COLUMN = { down: 0, up: 1, left: 2, right: 3 } as const;

// ข้อมูลเก่า (เลือกสีตอน Phase 2) หรือชื่อที่ไม่รู้จัก → ใช้ตัวละครเริ่มต้น
export function parseAvatar(value: unknown): Avatar {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const name = (v as { character?: unknown } | null)?.character;
  return { character: typeof name === 'string' && CHARACTERS.includes(name) ? name : DEFAULT_CHARACTER };
}

export const sheetUrl = (name: string) => `/assets/characters/${name}.png`;
export const faceUrl = (name: string) => `/assets/characters/${name}-face.png`;
