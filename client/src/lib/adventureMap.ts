import type { Stage } from './adventureStages';

// สร้างแผนที่ของด่านจากเลขด่าน (สุ่มแบบมี seed = ด่านเดิมได้แผนที่เดิมทุกครั้ง)
// ไม่มี Phaser ในไฟล์นี้ จะได้เอาไปทดสอบ/วาดรูปตรวจนอกเกมได้

export const MAP_W = 40;
export const MAP_H = 22;

// ชุดภาพที่ใช้ เรียงตาม firstgid (เลข tile รวมของทุกชุด เริ่มที่ 1 / 0 = ว่าง)
export const MAP_SETS = [
  { name: 'floor', file: 'TilesetFloor.png', cols: 22, rows: 26 },
  { name: 'nature', file: 'TilesetNature.png', cols: 24, rows: 21 },
  { name: 'detail', file: 'TilesetFloorDetail.png', cols: 16, rows: 5 },
].reduce<{ name: string; file: string; cols: number; rows: number; firstgid: number }[]>((list, s) => {
  const prev = list.at(-1);
  list.push({ ...s, firstgid: prev ? prev.firstgid + prev.cols * prev.rows : 1 });
  return list;
}, []);
const SET = Object.fromEntries(MAP_SETS.map((s) => [s.name, s]));
const gid = (set: string, col: number, row: number) => SET[set].firstgid + row * SET[set].cols + col;

export type StageMap = {
  ground: number[];
  deco: number[]; // เดินทับได้
  walls: number[]; // ของที่ชน (โคนต้นไม้ หิน)
  above: number[]; // ยอดไม้ วาดทับตัวละคร
  solid: boolean[]; // ช่องที่เดินไม่ได้
  start: { x: number; y: number }; // ช่องจุดเกิด
  spots: { x: number; y: number }[]; // ช่องของมอนแต่ละตัว
};

export function makeStageMap(stage: Stage, monsterCount: number, bossLast: boolean): StageMap {
  for (let attempt = 0; attempt < 30; attempt++) {
    const map = tryMap(stage, monsterCount, bossLast, stage.n * 7919 + attempt * 104729, attempt < 25);
    if (map) return map;
  }
  return tryMap(stage, monsterCount, bossLast, 1, false)!; // ไม่มีสิ่งกีดขวางกลางแผนที่ = เดินถึงแน่นอน
}

function tryMap(stage: Stage, monsterCount: number, bossLast: boolean, seed: number, obstacles: boolean): StageMap | null {
  // mulberry32: ตัวสุ่มเล็กๆ ที่ได้ผลเหมือนกันทุกเครื่อง
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const N = MAP_W * MAP_H;
  const ground = new Array<number>(N);
  const deco = new Array<number>(N).fill(0);
  const walls = new Array<number>(N).fill(0);
  const above = new Array<number>(N).fill(0);
  const solid = new Array<boolean>(N).fill(false);
  const used = new Array<boolean>(N).fill(false); // ห้ามวางของทับ
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const mark = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) used[j * MAP_W + i] = true;
  };
  const free = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!inMap(i, j) || used[j * MAP_W + i]) return false;
    return true;
  };

  // พื้น
  const { row, col } = stage.floor;
  for (let i = 0; i < N; i++) ground[i] = gid('floor', rand() < 0.1 ? col + 1 + Math.floor(rand() * 4) : col, row);

  // ของ 2x2: ต้นไม้ (แถว 0-1 ของชุด nature) แถวบนเป็นพุ่มใบวาดทับตัวละคร / หินและตอไม้ชนทั้งก้อน
  const big = (x: number, y: number, [c0, r0]: [number, number]) => {
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const k = (y + j) * MAP_W + x + i;
        const g = gid('nature', c0 + i, r0 + j);
        if (r0 === 0 && j === 0) above[k] = g;
        else walls[k] = g;
        solid[k] = true;
      }
    }
    mark(x, y, 2, 2);
  };
  const small = (x: number, y: number, [c0, r0]: [number, number]) => {
    const k = y * MAP_W + x;
    walls[k] = gid('nature', c0, r0);
    solid[k] = true;
    mark(x, y, 1, 1);
  };

  // ขอบแผนที่: ของ 2x2 เรียงชิดกันรอบด้าน
  for (let x = 0; x < MAP_W; x += 2) {
    big(x, 0, pick(stage.big));
    big(x, MAP_H - 2, pick(stage.big));
  }
  for (let y = 2; y < MAP_H - 2; y += 2) {
    big(0, y, pick(stage.big));
    big(MAP_W - 2, y, pick(stage.big));
  }

  // จุดเกิด (ซ้ายกลาง) และที่ยืนของมอน (กระจายไปทางขวา) เว้นที่ว่างรอบๆ ไว้
  const start = { x: 3, y: Math.floor(MAP_H / 2) };
  mark(start.x - 1, start.y - 2, 4, 5);
  const spots: { x: number; y: number }[] = [];
  const minions = monsterCount - (bossLast ? 1 : 0);
  const xEnd = bossLast ? MAP_W - 14 : MAP_W - 6;
  for (let i = 0; i < monsterCount; i++) {
    const isBoss = bossLast && i === monsterCount - 1;
    if (isBoss) {
      spots.push({ x: MAP_W - 7, y: Math.floor(MAP_H / 2) });
    } else {
      const x = minions > 1 ? 10 + Math.round((i * (xEnd - 10)) / (minions - 1)) : Math.round((10 + xEnd) / 2);
      spots.push({ x, y: 4 + Math.floor(rand() * (MAP_H - 8)) });
    }
    const p = spots[i];
    const r = isBoss ? 3 : 2;
    mark(p.x - r, p.y - r, r * 2 + 1, r * 2 + 1);
  }

  // สิ่งกีดขวางกลางแผนที่
  if (obstacles) {
    for (let n = 0; n < 40; n++) {
      const x = 2 + Math.floor(rand() * (MAP_W - 5));
      const y = 2 + Math.floor(rand() * (MAP_H - 5));
      if (rand() < 0.4) {
        if (free(x - 1, y - 1, 4, 4)) big(x, y, pick(stage.big));
      } else if (free(x - 1, y - 1, 3, 3)) {
        small(x, y, pick(stage.small));
      }
    }
  }

  // ต้องเดินจากจุดเกิดไปถึงมอนทุกตัวได้ (ตัวละครกว้างไม่ถึง 1 ช่อง ช่องว่างกว้าง 1 ช่องก็ผ่านได้)
  const seen = new Array<boolean>(N).fill(false);
  const queue = [start.y * MAP_W + start.x];
  seen[queue[0]] = true;
  while (queue.length) {
    const k = queue.pop()!;
    const x = k % MAP_W;
    const y = (k - x) / MAP_W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = ny * MAP_W + nx;
      if (inMap(nx, ny) && !solid[nk] && !seen[nk]) {
        seen[nk] = true;
        queue.push(nk);
      }
    }
  }
  if (!spots.every((p) => seen[p.y * MAP_W + p.x])) return null;

  // ของตกแต่งบนช่องว่าง
  for (let i = 0; i < N; i++) if (!solid[i] && !used[i] && rand() < 0.08) {
    const [sheet, c, r] = pick(stage.deco);
    deco[i] = gid(sheet, c, r);
  }
  return { ground, deco, walls, above, solid, start, spots };
}
