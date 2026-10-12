import { MAP_SETS } from './adventureMap';

// สนามรบ (เกมแนวเอาชีวิตรอด): ข้อมูลล้วน ไม่มี Phaser ในไฟล์นี้

export const RUN_SECONDS = 600; // รอดครบ 10 นาที บอสจะออกมา ล้มบอส = ชนะ
export const ARENA_W = 96; // ช่อง (ช่องละ 16px)
export const ARENA_H = 96;

// ---------- อัปเกรดตอนเลเวลอัป (เลือก 1 จาก 3) ----------
// อัปเกรดค่าตัว (สกิลโจมตีอยู่ใน lib/skills.ts)
export type UpgradeId = 'dmg' | 'rate' | 'multi' | 'pierce' | 'speed' | 'hp' | 'magnet' | 'regen';
export type Levels = Record<UpgradeId, number>;

export const UPGRADES: Record<UpgradeId, { name: string; emoji: string; max: number; desc: (next: number) => string }> = {
  dmg: { name: 'พลังโจมตี', emoji: '💪', max: 5, desc: () => 'ทุกการโจมตีและสกิลแรงขึ้น 25%' },
  rate: { name: 'มือไว', emoji: '⏩', max: 5, desc: () => 'ปาดาวกระจายและใช้สกิลถี่ขึ้น 18%' },
  multi: { name: 'ปาทีละหลายดอก', emoji: '✨', max: 4, desc: () => 'ปาดาวกระจายเพิ่ม 1 ดอก' },
  pierce: { name: 'ทะลุทะลวง', emoji: '🎯', max: 3, desc: () => 'ดาวกระจายทะลุมอนได้อีก 1 ตัว' },
  speed: { name: 'ฝีเท้าเบา', emoji: '👟', max: 3, desc: () => 'เดินเร็วขึ้น 10%' },
  hp: { name: 'ใจสู้', emoji: '❤️', max: 5, desc: () => 'เลือดสูงสุด +20 และฟื้นเลือด 20' },
  magnet: { name: 'แม่เหล็ก', emoji: '🧲', max: 3, desc: () => 'ดูดคริสตัลและเหรียญได้ไกลขึ้น 40%' },
  regen: { name: 'ลมหายใจนักสู้', emoji: '🌿', max: 3, desc: () => 'ฟื้นเลือดเองวินาทีละ 0.5' },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
export const noLevels = (): Levels => Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Levels;

export type Stats = {
  damage: number;
  cooldown: number; // วินาทีต่อการปา 1 ครั้ง
  count: number;
  pierce: number;
  speed: number;
  maxHp: number;
  pickup: number; // รัศมีดูดของ (พิกเซล)
  regen: number; // เลือดต่อวินาที
};

export function statsOf(l: Levels): Stats {
  return {
    damage: 10 * (1 + 0.25 * l.dmg),
    cooldown: 0.6 / (1 + 0.18 * l.rate),
    count: 1 + l.multi,
    pierce: l.pierce,
    speed: 85 * (1 + 0.1 * l.speed),
    maxHp: 100 + 20 * l.hp,
    pickup: 48 * (1 + 0.4 * l.magnet),
    regen: 0.5 * l.regen,
  };
}

// อัปเกรดค่าตัวที่ยังไม่เต็ม (ฉากเกมสุ่มรวมกับตัวเลือกสกิล)
export const openUpgrades = (l: Levels) => UPGRADE_IDS.filter((id) => l[id] < UPGRADES[id].max);

// คริสตัลที่ต้องเก็บเพื่อขึ้นเลเวลถัดไป
export const xpToNext = (level: number) => 5 + (level - 1) * 4;

// ---------- มอนสเตอร์ ----------
// from = วินาทีที่เริ่มออก / ยิ่งนานมอนยิ่งอึด (hp คูณ 1 + เวลา/240)
export type EnemyType = { key: string; hp: number; speed: number; damage: number; from: number };
export const ENEMIES: EnemyType[] = [
  { key: 'Slime', hp: 8, speed: 34, damage: 6, from: 0 },
  { key: 'Bamboo', hp: 14, speed: 38, damage: 8, from: 45 },
  { key: 'Mushroom', hp: 20, speed: 30, damage: 10, from: 90 },
  { key: 'BlueBat', hp: 10, speed: 62, damage: 6, from: 120 },
  { key: 'Skull', hp: 26, speed: 40, damage: 12, from: 180 },
  { key: 'Spirit', hp: 30, speed: 46, damage: 12, from: 240 },
  { key: 'Cyclope', hp: 70, speed: 28, damage: 18, from: 300 },
  { key: 'Flam', hp: 40, speed: 52, damage: 14, from: 360 },
  { key: 'Eye', hp: 50, speed: 44, damage: 16, from: 420 },
];
export const BOSS = { key: 'GiantSpirit', name: 'วิญญาณยักษ์', hp: 2500, speed: 30, damage: 25 };

// มอนที่ออกได้ตอนนี้ (ครึ่งหนึ่งเป็นชนิดใหม่ล่าสุด 2 แบบ)
export function pickEnemy(sec: number): EnemyType {
  const open = ENEMIES.filter((e) => e.from <= sec);
  if (open.length > 2 && Math.random() < 0.5) return open[open.length - 1 - Math.floor(Math.random() * 2)];
  return open[Math.floor(Math.random() * open.length)];
}

// มอนเกิดกี่ตัวต่อวินาที และมีบนจอได้มากสุดกี่ตัว
export const spawnPerSecond = (sec: number) => Math.min(12, 0.8 + sec / 40);
export const MAX_ENEMIES = 220;

// ---------- แผนที่สนาม: ทุ่งหญ้ากว้าง ขอบเป็นป่า มีต้นไม้กระจาย (ต้นไม้ขวางเฉพาะตัวเรา มอนเดินลอดใต้พุ่มได้) ----------
const SET = Object.fromEntries(MAP_SETS.map((s) => [s.name, s]));
const gid = (set: string, col: number, row: number) => SET[set].firstgid + row * SET[set].cols + col;

export type ArenaMap = { ground: number[]; deco: number[]; walls: number[]; above: number[]; solid: boolean[] };

export function makeArenaMap(seed = 20261012): ArenaMap {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const W = ARENA_W;
  const H = ARENA_H;
  const N = W * H;
  const ground = new Array<number>(N);
  const deco = new Array<number>(N).fill(0);
  const walls = new Array<number>(N).fill(0);
  const above = new Array<number>(N).fill(0);
  const solid = new Array<boolean>(N).fill(false);
  const used = new Array<boolean>(N).fill(false);
  for (let i = 0; i < N; i++) ground[i] = gid('floor', rand() < 0.1 ? 1 + Math.floor(rand() * 4) : 0, 12);

  const TREES = [0, 2, 16, 18];
  const tree = (x: number, y: number) => {
    const c0 = TREES[Math.floor(rand() * TREES.length)];
    for (let i = 0; i < 2; i++) {
      above[y * W + x + i] = gid('nature', c0 + i, 0);
      walls[(y + 1) * W + x + i] = gid('nature', c0 + i, 1);
      solid[y * W + x + i] = true;
      solid[(y + 1) * W + x + i] = true;
    }
    for (let j = y - 1; j <= y + 2; j++) for (let i = x - 1; i <= x + 2; i++) if (i >= 0 && j >= 0 && i < W && j < H) used[j * W + i] = true;
  };
  for (let x = 0; x < W; x += 2) {
    tree(x, 0);
    tree(x, H - 2);
  }
  for (let y = 2; y < H - 2; y += 2) {
    tree(0, y);
    tree(W - 2, y);
  }
  // กลางแผนที่ (จุดเกิด) โล่งไว้
  for (let j = H / 2 - 6; j < H / 2 + 6; j++) for (let i = W / 2 - 8; i < W / 2 + 8; i++) used[j * W + i] = true;
  for (let n = 0; n < 70; n++) {
    const x = 3 + Math.floor(rand() * (W - 7));
    const y = 3 + Math.floor(rand() * (H - 7));
    if (!used[y * W + x] && !used[(y + 1) * W + x + 1]) tree(x, y);
  }
  const TUFTS = [0, 1, 2, 3, 4, 5].map((c) => gid('detail', c, 2));
  const FLOWERS = [0, 1, 3, 6].map((c) => gid('nature', c, 11));
  for (let i = 0; i < N; i++) {
    if (solid[i]) continue;
    const r = rand();
    if (r < 0.05) deco[i] = TUFTS[Math.floor(rand() * TUFTS.length)];
    else if (r < 0.058) deco[i] = FLOWERS[Math.floor(rand() * FLOWERS.length)];
  }
  return { ground, deco, walls, above, solid };
}
