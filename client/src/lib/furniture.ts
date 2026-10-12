// รายการเฟอร์นิเจอร์ที่วางในห้องได้
// tile = [คอลัมน์, แถว] ของช่องซ้ายบนใน roguelike-indoor.png (แผ่นภาพ 27 คอลัมน์ ช่องละ 16px เว้นระยะ 1px)
// kind: floor = วางบนพื้น เดินชน (ยกเว้นที่นั่ง seat), wall = แขวนผนัง, rug = พรมปูพื้น เดินทับได้

export type FurnitureKind = 'floor' | 'wall' | 'rug';

export type Furniture = {
  id: string;
  name: string;
  kind: FurnitureKind;
  w: number;
  h: number;
  tile?: [col: number, row: number];
  color?: string; // สำหรับพรม (วาดด้วยโค้ด)
  seat?: boolean; // ที่นั่ง: เดินทับได้ ไม่ชน (ยืนบนเก้าอี้ = นั่งที่โต๊ะ)
};

export const SHEET_COLUMNS = 27;

export const FURNITURE: Furniture[] = [
  // --- เตียง ---
  { id: 'bed_single_orange', name: 'เตียงเดี่ยวส้ม', kind: 'floor', w: 1, h: 1, tile: [9, 6] },
  { id: 'bed_single_green', name: 'เตียงเดี่ยวเขียว', kind: 'floor', w: 1, h: 1, tile: [9, 7] },
  { id: 'bed_double_orange', name: 'เตียงคู่ส้ม', kind: 'floor', w: 2, h: 1, tile: [14, 6] },
  { id: 'bed_double_green', name: 'เตียงคู่เขียว', kind: 'floor', w: 2, h: 1, tile: [12, 7] },
  // --- โต๊ะ ---
  { id: 'table_square', name: 'โต๊ะเหลี่ยม', kind: 'floor', w: 1, h: 1, tile: [4, 3] },
  { id: 'table_round', name: 'โต๊ะกลม', kind: 'floor', w: 1, h: 1, tile: [7, 0] },
  { id: 'table_oval', name: 'โต๊ะวงรี', kind: 'floor', w: 2, h: 1, tile: [3, 0] },
  { id: 'table_long', name: 'โต๊ะยาว', kind: 'floor', w: 3, h: 1, tile: [0, 1] },
  { id: 'table_cloth', name: 'โต๊ะปูผ้า', kind: 'floor', w: 1, h: 1, tile: [0, 11] },
  { id: 'table_cloth_long', name: 'โต๊ะปูผ้ายาว', kind: 'floor', w: 3, h: 1, tile: [0, 9] },
  // --- เก้าอี้ ---
  { id: 'chair_front', name: 'เก้าอี้ (หันหน้า)', kind: 'floor', w: 1, h: 1, tile: [0, 2], seat: true },
  { id: 'chair_back', name: 'เก้าอี้ (หันหลัง)', kind: 'floor', w: 1, h: 1, tile: [1, 2], seat: true },
  { id: 'chair_right', name: 'เก้าอี้ (หันขวา)', kind: 'floor', w: 1, h: 1, tile: [2, 2], seat: true },
  { id: 'chair_left', name: 'เก้าอี้ (หันซ้าย)', kind: 'floor', w: 1, h: 1, tile: [3, 2], seat: true },
  { id: 'stool', name: 'เก้าอี้กลม', kind: 'floor', w: 1, h: 1, tile: [17, 3], seat: true },
  { id: 'armchair_orange', name: 'โซฟาเดี่ยวส้ม', kind: 'floor', w: 1, h: 1, tile: [14, 9], seat: true },
  { id: 'armchair_green', name: 'โซฟาเดี่ยวเขียว', kind: 'floor', w: 1, h: 1, tile: [14, 11], seat: true },
  // --- ของใช้ ---
  { id: 'bookshelf', name: 'ชั้นวางของ', kind: 'floor', w: 1, h: 1, tile: [19, 17] },
  { id: 'counter', name: 'ตู้ครัว', kind: 'floor', w: 1, h: 1, tile: [0, 12] },
  { id: 'stove', name: 'เตา', kind: 'floor', w: 1, h: 1, tile: [14, 14] },
  { id: 'barrel', name: 'ถังน้ำ', kind: 'floor', w: 1, h: 1, tile: [21, 4] },
  { id: 'piano', name: 'เปียโน', kind: 'floor', w: 2, h: 2, tile: [23, 8] },
  { id: 'plant_big', name: 'ต้นไม้ใหญ่', kind: 'floor', w: 1, h: 1, tile: [16, 0] },
  { id: 'plant_small', name: 'ต้นไม้เล็ก', kind: 'floor', w: 1, h: 1, tile: [17, 0] },
  { id: 'lamp', name: 'โคมไฟตั้งพื้น', kind: 'floor', w: 1, h: 2, tile: [20, 4] },
  // --- ติดผนัง ---
  { id: 'painting_map', name: 'แผนที่', kind: 'wall', w: 1, h: 1, tile: [18, 0] },
  { id: 'frames_small', name: 'กรอบรูปเล็ก', kind: 'wall', w: 1, h: 1, tile: [16, 12] },
  { id: 'painting_wide', name: 'ภาพวิว', kind: 'wall', w: 2, h: 1, tile: [20, 12] },
  { id: 'portrait_orange', name: 'ภาพเหมือนส้ม', kind: 'wall', w: 1, h: 2, tile: [20, 15] },
  { id: 'portrait_teal', name: 'ภาพเหมือนฟ้า', kind: 'wall', w: 1, h: 2, tile: [21, 15] },
  { id: 'mirror', name: 'กระจก', kind: 'wall', w: 1, h: 2, tile: [22, 14] },
  { id: 'tapestry_teal', name: 'ผ้าแขวนฟ้า', kind: 'wall', w: 2, h: 1, tile: [16, 14] },
  { id: 'tapestry_green', name: 'ผ้าแขวนเขียว', kind: 'wall', w: 2, h: 1, tile: [16, 16] },
  { id: 'torch', name: 'คบไฟ', kind: 'wall', w: 1, h: 1, tile: [20, 6] },
  // --- พรม ---
  { id: 'rug_red', name: 'พรมแดง', kind: 'rug', w: 3, h: 2, color: '#b5484b' },
  { id: 'rug_blue', name: 'พรมฟ้า', kind: 'rug', w: 3, h: 2, color: '#4b77b5' },
  { id: 'rug_green', name: 'พรมเขียว', kind: 'rug', w: 2, h: 2, color: '#4f9a62' },
  { id: 'rug_cream', name: 'พรมครีม', kind: 'rug', w: 2, h: 1, color: '#e2cfa3' },
];

export const FURNITURE_BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));

// เลขเฟรมใน spritesheet ของช่อง (dx, dy) ภายในชิ้นเฟอร์นิเจอร์
export function frameOf(item: Furniture, dx: number, dy: number) {
  const [col, row] = item.tile!;
  return (row + dy) * SHEET_COLUMNS + col + dx;
}

// สีเข้ม/สว่างขึ้น: amount -1..1
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// วาดเฟอร์นิเจอร์หนึ่งชิ้นลง canvas (ใช้ทำไอคอนในหน้าแต่งห้อง)
export function drawFurniture(ctx: CanvasRenderingContext2D, item: Furniture, sheet: HTMLImageElement, x = 0, y = 0) {
  if (item.kind === 'rug') {
    drawRug(ctx, item, x, y);
    return;
  }
  const [col, row] = item.tile!;
  for (let dy = 0; dy < item.h; dy++) {
    for (let dx = 0; dx < item.w; dx++) {
      ctx.drawImage(sheet, (col + dx) * 17, (row + dy) * 17, 16, 16, x + dx * 16, y + dy * 16, 16, 16);
    }
  }
}

export function drawRug(ctx: CanvasRenderingContext2D, item: Furniture, x: number, y: number) {
  const w = item.w * 16;
  const h = item.h * 16;
  const c = item.color!;
  ctx.fillStyle = shade(c, -0.35);
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = c;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = shade(c, 0.35);
  ctx.fillRect(x + 4, y + 4, w - 8, 1);
  ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
  ctx.fillRect(x + 4, y + 4, 1, h - 8);
  ctx.fillRect(x + w - 5, y + 4, 1, h - 8);
}
