// รายการเฟอร์นิเจอร์ที่วางในห้องได้
// tile = [คอลัมน์, แถว] ของช่องซ้ายบนในแผ่นภาพ sheet (ไม่ใส่ = ชุด Kenney เดิม)
// ⚠️ ห้ามเปลี่ยน id, w, h ของชิ้นที่มีอยู่แล้ว เพราะบ้านที่ผู้เล่นแต่งไว้ในฐานข้อมูลเก็บ id กับตำแหน่งไว้
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
  sheet?: SheetId;
};

// แผ่นภาพเฟอร์นิเจอร์: Kenney (เว้นระยะ 1px ระหว่างช่อง) และ Ninja Adventure (ชิดกัน)
export type SheetId = 'kenney' | 'element' | 'bed';
export const SHEETS: Record<SheetId, { key: string; url: string; columns: number; stride: number }> = {
  kenney: { key: 'indoor', url: 'assets/tiles/roguelike-indoor.png', columns: 27, stride: 17 },
  element: { key: 'ninja-element', url: 'assets/tiles/ninja/TilesetElement.png', columns: 16, stride: 16 },
  bed: { key: 'ninja-bed', url: 'assets/tiles/ninja/tileset_bed.png', columns: 14, stride: 16 },
};
export const sheetOf = (item: Furniture) => SHEETS[item.sheet ?? 'kenney'];

export const FURNITURE: Furniture[] = [
  // ===== ชุด Ninja Adventure (เข้ากับเมืองและตัวละคร) =====
  // --- เตียง (ยาว 2 ช่อง) ---
  { id: 'n_bed_green', name: 'เตียงเดี่ยวเขียว', kind: 'floor', w: 1, h: 2, tile: [12, 0], sheet: 'bed' },
  { id: 'n_bed_red', name: 'เตียงเดี่ยวแดง', kind: 'floor', w: 1, h: 2, tile: [5, 3], sheet: 'bed' },
  { id: 'n_bed_blue', name: 'เตียงเดี่ยวฟ้า', kind: 'floor', w: 1, h: 2, tile: [12, 3], sheet: 'bed' },
  { id: 'n_bed2_green', name: 'เตียงคู่เขียว', kind: 'floor', w: 2, h: 2, tile: [7, 0], sheet: 'bed' },
  { id: 'n_bed2_red', name: 'เตียงคู่แดง', kind: 'floor', w: 2, h: 2, tile: [0, 3], sheet: 'bed' },
  { id: 'n_bed2_blue', name: 'เตียงคู่ฟ้า', kind: 'floor', w: 2, h: 2, tile: [7, 3], sheet: 'bed' },
  // --- โต๊ะ / เก้าอี้ ---
  { id: 'n_table', name: 'โต๊ะไม้', kind: 'floor', w: 1, h: 1, tile: [3, 9], sheet: 'element' },
  { id: 'n_table_long', name: 'โต๊ะไม้ยาว', kind: 'floor', w: 3, h: 1, tile: [2, 10], sheet: 'element' },
  { id: 'n_table_cloth', name: 'โต๊ะผ้าแดง', kind: 'floor', w: 1, h: 1, tile: [14, 0], sheet: 'element' },
  { id: 'n_chair', name: 'เก้าอี้ไม้', kind: 'floor', w: 1, h: 1, tile: [0, 9], sheet: 'element', seat: true },
  // --- ชั้นวาง / ตู้ ---
  { id: 'n_bookshelf', name: 'ชั้นหนังสือ', kind: 'floor', w: 1, h: 2, tile: [3, 7], sheet: 'element' },
  { id: 'n_shelf', name: 'ชั้นวางของ', kind: 'floor', w: 1, h: 2, tile: [4, 7], sheet: 'element' },
  { id: 'n_bookcase', name: 'ตู้หนังสือใหญ่', kind: 'floor', w: 2, h: 2, tile: [8, 7], sheet: 'element' },
  { id: 'n_shelf_wide', name: 'ชั้นวางกว้าง', kind: 'floor', w: 2, h: 2, tile: [10, 7], sheet: 'element' },
  { id: 'n_dresser', name: 'ตู้ลิ้นชักใหญ่', kind: 'floor', w: 2, h: 2, tile: [6, 7], sheet: 'element' },
  { id: 'n_drawer', name: 'ตู้ลิ้นชัก', kind: 'floor', w: 1, h: 1, tile: [1, 8], sheet: 'element' },
  { id: 'n_drawer2', name: 'ตู้ลิ้นชักเล็ก', kind: 'floor', w: 1, h: 1, tile: [2, 8], sheet: 'element' },
  // --- ของใช้ ---
  { id: 'n_plant', name: 'กระถางต้นไม้', kind: 'floor', w: 1, h: 1, tile: [0, 8], sheet: 'element' },
  { id: 'n_barrel', name: 'ถังไม้', kind: 'floor', w: 1, h: 1, tile: [1, 0], sheet: 'element' },
  { id: 'n_chest', name: 'หีบสมบัติ', kind: 'floor', w: 1, h: 1, tile: [3, 1], sheet: 'element' },
  { id: 'n_crate', name: 'ลังไม้', kind: 'floor', w: 1, h: 1, tile: [6, 0], sheet: 'element' },
  { id: 'n_pot', name: 'ไหแดง', kind: 'floor', w: 1, h: 1, tile: [3, 0], sheet: 'element' },
  { id: 'n_stove', name: 'เตาดิน', kind: 'floor', w: 1, h: 1, tile: [12, 0], sheet: 'element' },
  // --- ติดผนัง ---
  { id: 'n_notice', name: 'กระดานประกาศ', kind: 'wall', w: 3, h: 1, tile: [11, 1], sheet: 'element' },
  { id: 'n_painting_mountain', name: 'ภาพภูเขา', kind: 'wall', w: 1, h: 1, tile: [10, 1], sheet: 'element' },
  { id: 'n_painting_round', name: 'ภาพวงกลม', kind: 'wall', w: 1, h: 1, tile: [8, 10], sheet: 'element' },
  { id: 'n_frame', name: 'กรอบรูปยาว', kind: 'wall', w: 1, h: 1, tile: [6, 10], sheet: 'element' },
  { id: 'n_curtain', name: 'ผ้าม่านแดง', kind: 'wall', w: 3, h: 1, tile: [8, 9], sheet: 'element' },

  // ===== ชุดเดิม (Kenney) เก็บไว้ให้บ้านที่แต่งไปแล้วยังใช้ได้ =====
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
  return (row + dy) * sheetOf(item).columns + col + dx;
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
export function drawFurniture(
  ctx: CanvasRenderingContext2D,
  item: Furniture,
  sheets: Record<SheetId, HTMLImageElement>,
  x = 0,
  y = 0,
) {
  if (item.kind === 'rug') {
    drawRug(ctx, item, x, y);
    return;
  }
  const [col, row] = item.tile!;
  const { stride } = sheetOf(item);
  const img = sheets[item.sheet ?? 'kenney'];
  for (let dy = 0; dy < item.h; dy++) {
    for (let dx = 0; dx < item.w; dx++) {
      ctx.drawImage(img, (col + dx) * stride, (row + dy) * stride, 16, 16, x + dx * 16, y + dy * 16, 16, 16);
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
