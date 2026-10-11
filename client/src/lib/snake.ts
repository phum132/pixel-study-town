import { supabase } from './supabase';

// กติกา Snake — ต้องตรงกับ simulate_snake ใน supabase/migrations/004_snake.sql ทุกข้อ
// ไม่งั้นคะแนนที่ฐานข้อมูลนับจะไม่ตรงกับที่เห็นบนจอ
export const GRID = 20;
export const TICK_MS = 110;
const CELLS = GRID * GRID;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export type Dir = 0 | 1 | 2 | 3; // ขึ้น ขวา ลง ซ้าย
export type Input = [tick: number, dir: Dir];

export class SnakeEngine {
  body: number[] = [208, 209, 210]; // หาง → หัว (แถว 10 ช่อง 8-10)
  dir: Dir = 1;
  food = -2; // -2 = ต้องสุ่มใหม่, -1 = เต็มกระดาน (ชนะ)
  score = 0;
  tick = 0;
  dead = false;
  inputs: Input[] = []; // สิ่งที่ส่งให้ฐานข้อมูลตรวจ
  private occ = new Array<boolean>(CELLS).fill(false);
  private rng: bigint;

  constructor(seed: number) {
    this.rng = BigInt(seed);
    for (const c of this.body) this.occ[c] = true;
    this.placeFood();
  }

  private placeFood() {
    const free = CELLS - this.body.length;
    if (free === 0) {
      this.food = -1;
      this.dead = true;
      return;
    }
    // ตัวเลขใหญ่เกินที่ number เก็บได้แม่นยำ จึงใช้ BigInt ให้ได้ผลเหมือน bigint ใน Postgres
    this.rng = (this.rng * 1103515245n + 12345n) % 2147483648n;
    const r = Number(this.rng % BigInt(free));
    let c = 0;
    for (let i = 0; i < CELLS; i++) {
      if (this.occ[i]) continue;
      if (c === r) {
        this.food = i;
        return;
      }
      c++;
    }
  }

  // เดิน 1 ตา: wanted = ทิศที่ผู้เล่นกดไว้ (ถ้ามี)
  step(wanted?: Dir) {
    if (this.dead) return;
    this.tick++;
    if (wanted !== undefined && wanted !== this.dir && wanted !== (this.dir + 2) % 4) {
      this.dir = wanted;
      this.inputs.push([this.tick, wanted]);
    }

    const head = this.body[this.body.length - 1];
    const hx = (head % GRID) + DX[this.dir];
    const hy = Math.floor(head / GRID) + DY[this.dir];
    if (hx < 0 || hx >= GRID || hy < 0 || hy >= GRID) {
      this.dead = true;
      return;
    }
    const nh = hy * GRID + hx;
    const eating = nh === this.food;
    if (!eating) this.occ[this.body.shift()!] = false;
    if (this.occ[nh]) {
      this.dead = true;
      return;
    }
    this.body.push(nh);
    this.occ[nh] = true;
    if (eating) {
      this.score++;
      this.placeFood();
    }
  }

  // หันกลับหลังทันทีไม่ได้ (จะชนตัวเอง)
  canTurn(d: Dir) {
    return d !== this.dir && d !== (this.dir + 2) % 4;
  }
}

// ---------- คุยกับฐานข้อมูล ----------

export async function startSnake(): Promise<{ run_id: string; seed: number }> {
  const { data, error } = await supabase.rpc('start_snake');
  if (error) throw error;
  return data;
}

export async function finishSnake(runId: string, inputs: Input[]) {
  const { data, error } = await supabase.rpc('finish_snake', { run_id: runId, inputs });
  if (error) throw error;
  return data as { score: number; ticks: number; best: number; rejected: boolean };
}

export async function snakeTop(): Promise<{ username: string; best: number }[]> {
  const { data, error } = await supabase.rpc('snake_top');
  if (error) throw error;
  return data;
}
