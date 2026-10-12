import type { Level } from './adventure';

// ฉากของแต่ละด่าน (ไม่มีโค้ดฐานข้อมูลในไฟล์นี้ จะได้เอาไปวาดรูปตรวจนอกเกมได้)

// พื้นของฉาก = แถวพื้นเรียบใน TilesetFloor.png (คอลัมน์ 0-4 เป็นลายต่างๆ ของพื้นแบบเดียวกัน)
export type Floor = { row: number; col: number };
const FLOOR = {
  grass: { row: 12, col: 0 },
  darkGrass: { row: 12, col: 11 },
  sand: { row: 5, col: 0 },
  pinkSand: { row: 5, col: 11 },
  snow: { row: 19, col: 0 },
  mud: { row: 19, col: 11 },
} satisfies Record<string, Floor>;

// ของในฉาก (เลขช่องใน TilesetNature.png 24 คอลัมน์): ต้นไม้/หิน 2x2 ใช้ทำขอบและสิ่งกีดขวาง, ของ 1x1 วางกระจาย
export type Stage = {
  n: number;
  name: string;
  emoji: string;
  floor: Floor;
  tint?: number; // ย้อมสีทั้งฉาก (ถ้ำมืด)
  big: [col: number, row: number][]; // ของ 2x2 (ซ้ายบน)
  small: [col: number, row: number][]; // ของ 1x1 ที่ชน
  deco: [sheet: 'detail' | 'nature', col: number, row: number][]; // ของตกแต่งที่เดินทับได้
  monsters: string[]; // ชื่อไฟล์ใน public/assets/monsters
};

const TUFTS: Stage['deco'] = [0, 1, 2, 3, 4, 5].map((c) => ['detail', c, 2]);
export const STAGES: Stage[] = [
  {
    n: 1, name: 'ทุ่งหญ้าสไลม์', emoji: '🌱', floor: FLOOR.grass,
    big: [[0, 0], [16, 0], [18, 0]], small: [[10, 9], [0, 10], [1, 10]], deco: TUFTS, monsters: ['Slime', 'Slime2'],
  },
  {
    n: 2, name: 'สวนดอกไม้', emoji: '🌸', floor: FLOOR.grass,
    big: [[14, 0], [12, 0]], small: [[9, 9], [2, 10]], deco: [['nature', 0, 11], ['nature', 1, 11], ['nature', 3, 11], ['nature', 6, 11], ...TUFTS],
    monsters: ['Butterfly', 'Mushroom'],
  },
  {
    n: 3, name: 'ป่าไผ่', emoji: '🎋', floor: FLOOR.darkGrass,
    big: [[2, 0], [6, 0]], small: [[12, 9], [12, 10], [10, 8], [4, 10]], deco: TUFTS, monsters: ['Bamboo', 'BambooYellow'],
  },
  {
    n: 4, name: 'ป่าลึก', emoji: '🌲', floor: FLOOR.darkGrass,
    big: [[2, 0], [0, 8]], small: [[4, 8], [4, 9], [5, 10]], deco: TUFTS, monsters: ['SpiderRed', 'Mole'],
  },
  {
    n: 5, name: 'ชายหาดชมพู', emoji: '🏖️', floor: FLOOR.pinkSand,
    big: [[13, 8], [14, 0]], small: [[9, 8], [9, 9], [15, 9]], deco: [['nature', 11, 12], ['nature', 8, 13]], monsters: ['KappaGreen', 'Octopus'],
  },
  {
    n: 6, name: 'ทะเลทราย', emoji: '🏜️', floor: FLOOR.sand,
    big: [[4, 0], [13, 8], [2, 8]], small: [[15, 9], [4, 13], [6, 13]], deco: [['nature', 11, 12]], monsters: ['Snake', 'Lizard'],
  },
  {
    n: 7, name: 'ทุ่งหิมะ', emoji: '❄️', floor: FLOOR.snow,
    big: [[8, 0], [10, 0], [2, 12]], small: [[5, 12], [4, 12], [10, 12]], deco: [['nature', 8, 13], ['nature', 9, 13]], monsters: ['Spirit', 'Owl'],
  },
  {
    n: 8, name: 'หนองน้ำมืด', emoji: '🐸', floor: FLOOR.mud,
    big: [[4, 0], [0, 8]], small: [[6, 12], [7, 12], [5, 13]], deco: [['nature', 11, 12]], monsters: ['Eye', 'Larva'],
  },
  {
    n: 9, name: 'ถ้ำค้างคาว', emoji: '🦇', floor: FLOOR.mud, tint: 0x9a90b8,
    big: [[16, 8], [0, 12], [13, 8]], small: [[18, 9], [7, 12], [8, 12]], deco: [['nature', 11, 12]], monsters: ['BlueBat', 'Skull'],
  },
  {
    n: 10, name: 'รังบอส', emoji: '👹', floor: FLOOR.mud, tint: 0xc7a0a0,
    big: [[4, 0], [16, 8]], small: [[18, 9], [6, 12]], deco: [['nature', 11, 12]], monsters: ['Cyclope', 'Flam'],
  },
];

// บอสด่าน 10 ของแต่ละระดับ (ภาพ Idle 5 เฟรม เฟรมละ 50x50)
export const BOSSES: Record<Level, { key: string; name: string }> = {
  lower: { key: 'GiantFlam', name: 'ราชาเปลวไฟ' },
  upper: { key: 'DemonCyclop', name: 'ปีศาจตาเดียว' },
  uni: { key: 'GiantSpirit', name: 'วิญญาณยักษ์' },
};

// ชื่อไทยของมอน
const NAMES: Record<string, string> = {
  Slime: 'สไลม์ฟ้า', Slime2: 'สไลม์', Butterfly: 'ผีเสื้อจอมกวน', Mushroom: 'เห็ดพิษ', Bamboo: 'ภูตไผ่', BambooYellow: 'ภูตไผ่ทอง',
  SpiderRed: 'แมงมุมแดง', Mole: 'ตัวตุ่น', KappaGreen: 'กัปปะ', Octopus: 'หมึกยักษ์', Snake: 'งูทะเลทราย', Lizard: 'กิ้งก่า',
  Spirit: 'ภูตหิมะ', Owl: 'นกฮูก', Eye: 'ลูกตาลอยได้', Larva: 'หนอนบึง', BlueBat: 'ค้างคาว', Skull: 'หัวกะโหลก',
  Cyclope: 'ไซคลอปส์', Flam: 'ภูตไฟ',
};

export const monsterUrl = (key: string) => `/assets/monsters/${key}.png`;
export const monsterFaceUrl = (key: string) => `/assets/monsters/${key}-face.png`;

// มอนตัวที่ i ของด่าน: ด่าน 10 ตัวสุดท้ายเป็นบอส / ตัวที่เลือดเกิน 1 เป็นหัวหน้า (ตัวใหญ่)
export type Foe = { key: string; name: string; boss: boolean; elite: boolean };
export function foeOf(stage: Stage, level: Level, i: number, total: number, maxHp: number): Foe {
  if (stage.n === 10 && i === total - 1) return { key: BOSSES[level].key, name: BOSSES[level].name, boss: true, elite: false };
  const key = stage.monsters[i % stage.monsters.length];
  const name = NAMES[key] ?? key;
  return { key, name: maxHp > 1 ? `หัวหน้า${name}` : name, boss: false, elite: maxHp > 1 };
}
