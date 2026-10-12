import { MAP_SETS } from './adventureMap';
import { STAGES, type Stage } from './adventureStages';

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

// ---------- มอนสเตอร์ + แมพ ----------
// from = วินาทีที่เริ่มออก / ยิ่งนานมอนยิ่งอึด (hp คูณ 1 + เวลา/240) และแมพหลังๆ อึดกว่า (hpMul)
export type EnemyType = { key: string; hp: number; speed: number; damage: number; from: number };
export type BossType = { key: string; name: string; hp: number; speed: number; damage: number; tint?: number };
export type ArenaMapDef = { n: number; name: string; emoji: string; desc: string; theme: Stage; hpMul: number; roster: EnemyType[]; boss: BossType };

const E = (key: string, hp: number, speed: number, damage: number, from: number): EnemyType => ({ key, hp, speed, damage, from });

// ต้องตรงกับแมพ 1-5 ใน supabase/migrations/010_arena_maps_gacha.sql (ปลดล็อกทีละแมพ)
export const ARENA_MAPS: ArenaMapDef[] = [
  {
    n: 1, name: 'ทุ่งหญ้าสายลม', emoji: '🌱', desc: 'จุดเริ่มต้นของนักสู้', theme: STAGES[0], hpMul: 1,
    roster: [E('Slime', 8, 34, 6, 0), E('Bamboo', 14, 38, 8, 45), E('Mushroom', 20, 30, 10, 90), E('BlueBat', 10, 62, 6, 120),
      E('Skull', 26, 40, 12, 180), E('Spirit', 30, 46, 12, 240), E('Cyclope', 70, 28, 18, 300), E('Flam', 40, 52, 14, 360), E('Eye', 50, 44, 16, 420)],
    boss: { key: 'GiantSpirit', name: 'วิญญาณยักษ์', hp: 2500, speed: 30, damage: 25 },
  },
  {
    n: 2, name: 'ทะเลทรายเดือด', emoji: '🏜️', desc: 'งูกับกิ้งก่าเต็มไปหมด', theme: STAGES[5], hpMul: 1.4,
    roster: [E('Snake', 10, 40, 7, 0), E('Lizard', 16, 46, 9, 45), E('Mole', 24, 30, 12, 100), E('SpiderRed', 18, 58, 10, 150),
      E('Skull', 30, 40, 13, 220), E('Cyclope', 80, 28, 20, 300), E('Flam', 45, 54, 15, 380)],
    boss: { key: 'GiantFlam', name: 'ราชาเปลวไฟ', hp: 3500, speed: 34, damage: 28 },
  },
  {
    n: 3, name: 'ทุ่งหิมะนิรันดร์', emoji: '❄️', desc: 'ภูตหิมะกับนกฮูกจู่โจมจากทุกทาง', theme: STAGES[6], hpMul: 1.9,
    roster: [E('Spirit', 14, 44, 8, 0), E('Owl', 18, 52, 10, 50), E('BlueBat', 12, 66, 8, 100), E('Eye', 40, 42, 14, 170),
      E('Larva', 30, 32, 14, 240), E('Cyclope', 90, 28, 22, 320)],
    boss: { key: 'GiantSpirit', name: 'ราชินีหิมะ', hp: 4800, speed: 34, damage: 30, tint: 0x9fe8ff },
  },
  {
    n: 4, name: 'ถ้ำค้างคาวมืด', emoji: '🦇', desc: 'มืดจนแทบมองไม่เห็น ระวังรอบตัว', theme: STAGES[8], hpMul: 2.5,
    roster: [E('BlueBat', 14, 68, 9, 0), E('Skull', 28, 42, 13, 40), E('Larva', 32, 34, 14, 100), E('Eye', 44, 46, 16, 160),
      E('SpiderRed', 26, 60, 13, 220), E('Cyclope', 100, 30, 24, 300)],
    boss: { key: 'DemonCyclop', name: 'ปีศาจตาเดียว', hp: 6500, speed: 36, damage: 32 },
  },
  {
    n: 5, name: 'รังราชาปีศาจ', emoji: '🔥', desc: 'ด่านสุดท้าย มอนทุกตัวเลือดหนาสุดๆ', theme: STAGES[9], hpMul: 3.2,
    roster: [E('Flam', 30, 54, 12, 0), E('Skull', 34, 44, 15, 40), E('SpiderRed', 30, 62, 14, 100), E('Mole', 40, 34, 18, 160),
      E('Eye', 50, 48, 18, 220), E('Cyclope', 120, 32, 26, 280)],
    boss: { key: 'DemonCyclop', name: 'ราชาปีศาจ', hp: 9000, speed: 40, damage: 36, tint: 0xff8a7a },
  },
];

// มอนที่ออกได้ตอนนี้ (ครึ่งหนึ่งเป็นชนิดใหม่ล่าสุด 2 แบบ)
export function pickEnemy(roster: EnemyType[], sec: number): EnemyType {
  const open = roster.filter((e) => e.from <= sec);
  if (open.length > 2 && Math.random() < 0.5) return open[open.length - 1 - Math.floor(Math.random() * 2)];
  return open[Math.floor(Math.random() * open.length)];
}

// มอนเกิดกี่ตัวต่อวินาที และมีบนจอได้มากสุดกี่ตัว
export const spawnPerSecond = (sec: number) => Math.min(12, 0.8 + sec / 40);
export const MAX_ENEMIES = 220;

// ---------- แผนที่สนาม: ลานกว้างตามธีมของแมพ ขอบเป็นต้นไม้/หิน มีของกระจาย (ของขวางเฉพาะตัวเรา มอนเดินลอดได้) ----------
const SET = Object.fromEntries(MAP_SETS.map((s) => [s.name, s]));
const gid = (set: string, col: number, row: number) => SET[set].firstgid + row * SET[set].cols + col;

export type ArenaMap = { ground: number[]; deco: number[]; walls: number[]; above: number[]; solid: boolean[] };

export function makeArenaMap(theme: Stage, seed = 20261012): ArenaMap {
  let s = (seed + theme.n * 7919) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const W = ARENA_W;
  const H = ARENA_H;
  const N = W * H;
  const ground = new Array<number>(N);
  const deco = new Array<number>(N).fill(0);
  const walls = new Array<number>(N).fill(0);
  const above = new Array<number>(N).fill(0);
  const solid = new Array<boolean>(N).fill(false);
  const used = new Array<boolean>(N).fill(false);
  const { row, col } = theme.floor;
  for (let i = 0; i < N; i++) ground[i] = gid('floor', rand() < 0.1 ? col + 1 + Math.floor(rand() * 4) : col, row);

  const mark = (x: number, y: number) => {
    for (let j = y - 1; j <= y + 2; j++) for (let i = x - 1; i <= x + 2; i++) if (i >= 0 && j >= 0 && i < W && j < H) used[j * W + i] = true;
  };
  // ของ 2x2: ต้นไม้ (แถว 0 ของชุด nature) แถวบนวาดทับตัวละคร / หินและตอไม้ชนทั้งก้อน
  const big = (x: number, y: number) => {
    const [c0, r0] = pick(theme.big);
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const k = (y + j) * W + x + i;
        const g = gid('nature', c0 + i, r0 + j);
        if (r0 === 0 && j === 0) above[k] = g;
        else walls[k] = g;
        solid[k] = true;
      }
    }
    mark(x, y);
  };
  const small = (x: number, y: number) => {
    const [c0, r0] = pick(theme.small);
    walls[y * W + x] = gid('nature', c0, r0);
    solid[y * W + x] = true;
    mark(x, y);
  };
  for (let x = 0; x < W; x += 2) {
    big(x, 0);
    big(x, H - 2);
  }
  for (let y = 2; y < H - 2; y += 2) {
    big(0, y);
    big(W - 2, y);
  }
  // กลางแผนที่ (จุดเกิด) โล่งไว้
  for (let j = H / 2 - 6; j < H / 2 + 6; j++) for (let i = W / 2 - 8; i < W / 2 + 8; i++) used[j * W + i] = true;
  for (let n = 0; n < 90; n++) {
    const x = 3 + Math.floor(rand() * (W - 7));
    const y = 3 + Math.floor(rand() * (H - 7));
    if (used[y * W + x] || used[(y + 1) * W + x + 1]) continue;
    if (rand() < 0.6) big(x, y);
    else small(x, y);
  }
  for (let i = 0; i < N; i++) {
    if (solid[i] || rand() >= 0.06) continue;
    const [sheet, c, r] = pick(theme.deco);
    deco[i] = gid(sheet, c, r);
  }
  return { ground, deco, walls, above, solid };
}
