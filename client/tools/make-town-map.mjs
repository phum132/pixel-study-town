// สร้างแผนที่เมือง 4 ย่าน (ชุดภาพ Ninja Adventure) เป็นไฟล์ Tiled JSON: public/assets/maps/town.json
// รัน: npm run map — คำเตือน: จะเขียนทับ town.json ถ้าแก้แผนที่ในโปรแกรม Tiled ไปแล้วอย่ารันซ้ำ
//
//   ┌──────────────┬──────────────┐
//   │ 📚 ห้องสมุด    │ ☕ คาเฟ่        │
//   ├────── ลานกลางเมือง + ตู้เกม ──────┤
//   │ 🏠 ย่านบ้าน    │ 🌸 สวน + ทะเลสาบ │
//   └──────────────┴──────────────┘
import { writeFileSync } from 'node:fs';

const W = 64;
const H = 48;

// ---------- ชุดภาพ (ลำดับ firstgid ต้องตรงกับ tilesets ด้านล่าง) ----------
const SETS = [
  { name: 'floor', file: 'TilesetFloor.png', cols: 22, rows: 26, w: 352, h: 417 },
  { name: 'water', file: 'TilesetWater.png', cols: 28, rows: 17, w: 448, h: 272 },
  { name: 'nature', file: 'TilesetNature.png', cols: 24, rows: 21, w: 384, h: 336 },
  { name: 'house', file: 'TilesetHouse.png', cols: 33, rows: 23, w: 528, h: 368 },
  { name: 'detail', file: 'TilesetFloorDetail.png', cols: 16, rows: 5, w: 256, h: 80 },
];
let next = 1;
for (const s of SETS) {
  s.firstgid = next;
  next += s.cols * s.rows;
}
const SET = Object.fromEntries(SETS.map((s) => [s.name, s]));
// gid ของช่อง (col,row) ในชุดภาพ
const gid = (set, col, row) => SET[set].firstgid + row * SET[set].cols + col;

// ---------- ชั้นของแผนที่ ----------
const layer = () => new Array(W * H).fill(0);
const ground = layer(); // หญ้า ดิน น้ำ
const deco = layer(); // ดอกไม้ หญ้าเล็กๆ (เดินทับได้)
const walls = layer(); // ชนได้: ตัวตึก โคนต้นไม้
const above = layer(); // วาดทับตัวละคร: หลังคา ยอดไม้
const block = layer(); // ชนได้แต่มองไม่เห็น (น้ำ) — ซ่อนไว้ในเกม
const used = new Array(W * H).fill(false); // ช่องที่มีของแล้ว ห้ามสุ่มของตกแต่งทับ

const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const put = (arr, x, y, g) => inMap(x, y) && (arr[y * W + x] = g);
const mark = (x, y, w = 1, h = 1) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) used[j * W + i] = true;
};

let seed = 20261012;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- พื้นหญ้า ----------
const GRASS = gid('floor', 0, 12);
const GRASS_VARIANTS = [1, 2, 3, 4].map((c) => gid('floor', c, 12));
for (let i = 0; i < W * H; i++) ground[i] = rand() < 0.12 ? pick(GRASS_VARIANTS) : GRASS;

// ---------- ทางดิน (autotile) ----------
// ดูสีของ tile แต่ละแบบที่ 8 จุด: N E S W NE SE SW NW ("#" = ดิน, "g" = หญ้า) แล้วเลือกแบบที่ตรงกับเพื่อนบ้านมากที่สุด
// ค่าพวกนี้ได้จากการวัดสีในภาพจริง (tools ไม่ต้องรันซ้ำ)
const DIRT_TILES = {
  154: 'g##gg#gg', 155: 'g###g##g', 156: 'ggg#gg#g', 157: 'gg#ggggg', 158: 'g##ggggg', 159: 'g###gg#g',
  160: 'g###g#gg', 161: 'gg##gggg', 162: 'g###gggg', 163: '####g#g#', 176: '###g##gg', 177: '########',
  178: '#g##gg##', 179: '#g#ggggg', 180: '###g#ggg', 181: '#####g##', 182: '######g#', 183: '#g##ggg#',
  184: '#####gg#', 185: '#####g#g', 198: '##gg#ggg', 199: '##g##gg#', 200: '#gggggg#', 201: '#ggggggg',
  202: '###gg#gg', 203: '####g###', 204: '#######g', 205: '#g##gg#g', 206: '####g##g', 207: '####g#gg',
  220: 'g#gggggg', 221: 'g#g#gggg', 222: 'ggg#gggg', 223: 'gggggggg', 224: '##gggggg', 225: '##g#ggg#',
  226: '##g##ggg', 227: '#gg#gggg', 228: '##g#gggg', 229: '#####ggg',
};
const dirt = new Array(W * H).fill(false);
const isDirt = (x, y) => inMap(x, y) && dirt[y * W + x];
const paveRect = (x, y, w, h) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) dirt[j * W + i] = true;
  mark(x, y, w, h);
};
function applyDirt() {
  const entries = Object.entries(DIRT_TILES);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isDirt(x, y)) continue;
      const n = isDirt(x, y - 1), e = isDirt(x + 1, y), s = isDirt(x, y + 1), w = isDirt(x - 1, y);
      const want = [
        n, e, s, w,
        n && e && isDirt(x + 1, y - 1), s && e && isDirt(x + 1, y + 1),
        s && w && isDirt(x - 1, y + 1), n && w && isDirt(x - 1, y - 1),
      ].map((d) => (d ? '#' : 'g')).join('');
      let best = 177, bestScore = -1;
      for (const [idx, sig] of entries) {
        let score = 0;
        for (let k = 0; k < 8; k++) if (sig[k] === want[k]) score += k < 4 ? 2 : 1; // ขอบสำคัญกว่ามุม
        if (score > bestScore) [best, bestScore] = [+idx, score];
      }
      ground[y * W + x] = SET.floor.firstgid + best;
    }
  }
}

// ---------- ทะเลสาบ (ชุดน้ำ 3x3: มุม ขอบ กลาง) ----------
function lake(x, y, w, h) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const col = i === 0 ? 0 : i === w - 1 ? 2 : 1;
      const row = j === 0 ? 6 : j === h - 1 ? 8 : 7;
      put(ground, x + i, y + j, gid('water', col, row));
      // ขอบนอกสุดเป็นตลิ่ง เดินได้นิดหน่อย ส่วนข้างในชน
      if (i > 0 && j > 0 && i < w - 1 && j < h - 1) put(block, x + i, y + j, GRASS);
    }
  }
  mark(x - 1, y - 1, w + 2, h + 2);
}

// ---------- ตึก: (col,row) ซ้ายบนในชุด house, กว้าง x สูง, ประตูอยู่คอลัมน์ไหน (นับจากซ้าย) ----------
const BUILDINGS = {
  houseOrange: { col: 0, row: 0, w: 4, h: 3, door: 1 },
  houseBeige: { col: 4, row: 0, w: 4, h: 3, door: 1 },
  houseOrange2: { col: 8, row: 0, w: 4, h: 3, door: 1 },
  temple: { col: 12, row: 0, w: 4, h: 3, door: 1 },
  ramen: { col: 16, row: 0, w: 3, h: 3, door: 1 },
  teaHouse: { col: 19, row: 0, w: 4, h: 3, door: 2 },
  shrine: { col: 23, row: 0, w: 3, h: 3, door: 1 },
  woodHouse: { col: 26, row: 0, w: 3, h: 3, door: 1 },
};
const doors = []; // ประตู: เดินชนจากด้านล่าง = เข้าบ้านตัวเอง (หรือเข้าตึกสาธารณะ ถ้ามี place)
// ป้ายเล็กหน้าตึกที่เข้าได้ + ป้ายบอกทางในลาน (ชื่อลอยในเกม)
const PLACE_SIGNS = { library: '📚 ห้องสมุด', shrine: '🧘 ห้องสมาธิ', cafe: '🍵 คาเฟ่', ramen: '🍜 ราเมน' };
const signs = [];

function building(kind, x, y, { isHome = false, place = '' } = {}) {
  const b = BUILDINGS[kind];
  for (let j = 0; j < b.h; j++) {
    for (let i = 0; i < b.w; i++) {
      const g = gid('house', b.col + i, b.row + j);
      if (j === 0) put(above, x + i, y + j, g); // แถวบนสุดของหลังคา: ตัวละครเดินไปยืนข้างหลังได้
      else put(walls, x + i, y + j, g);
    }
  }
  for (let i = 0; i < b.w; i++) put(block, x + i, y, GRASS); // หลังคาแถวบนก็ยังเดินทะลุไม่ได้
  mark(x - 1, y - 1, b.w + 2, b.h + 2);
  const dx = x + b.door;
  if (isHome || place) doors.push({ x: dx * 16, y: (y + b.h) * 16 - 2, width: 16, height: 10, place });
  if (place) signs.push({ text: PLACE_SIGNS[place], x: dx * 16 + 8, y: (y + b.h - 1) * 16 - 5 });
  return { doorX: dx, bottom: y + b.h };
}

// ---------- ต้นไม้ ----------
// ต้นไม้ขนาด 2x2 ในชุด nature แถวแรก: เลขคอลัมน์ซ้ายของแต่ละต้น
const TREE = { green: 0, darkGreen: 2, dead: 4, leafy: 6, white: 12, pink: 14, lime: 16, lime2: 18 };
const FOREST = [TREE.green, TREE.darkGreen, TREE.lime, TREE.lime2];
// แถวบน (พุ่มใบ) วาดทับตัวละคร แถวล่าง (ลำต้น) เดินชน
function smallTree(x, y, col = pick(FOREST)) {
  for (let i = 0; i < 2; i++) {
    put(above, x + i, y, gid('nature', col + i, 0));
    put(walls, x + i, y + 1, gid('nature', col + i, 1));
  }
  mark(x, y, 2, 2);
}
const isFree = (x, y, w, h) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!inMap(i, j) || used[j * W + i]) return false;
  return true;
};
// ต้นไม้ใหญ่ 3x3: สองแถวบนเป็นพุ่มใบ (ทับตัวละคร) แถวล่างเป็นลำต้น (ชน)
const BIG_TREES = { pink: 0, green: 3, white: 6, orange: 9 };
function bigTree(kind, x, y) {
  const c0 = BIG_TREES[kind];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const g = gid('nature', c0 + i, 18 + j);
      put(j < 2 ? above : walls, x + i, y + j, g);
    }
  }
  put(walls, x + 1, y + 2, gid('nature', c0 + 1, 20));
  mark(x - 1, y - 1, 5, 5);
}

// =========================================================
// วางเมือง
// =========================================================

// ป่าล้อมรอบ (ต้นไม้ 2x2 เรียงชิดกัน)
for (let x = 0; x < W; x += 2) {
  smallTree(x, 0);
  smallTree(x, H - 2);
}
for (let y = 2; y < H - 2; y += 2) {
  smallTree(0, y);
  smallTree(W - 2, y);
}

// ลานกลางเมือง + ถนนหลัก 4 ทิศ (กว้าง 2 ช่อง)
const PLAZA = { x: 26, y: 19, w: 12, h: 10 };
paveRect(PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h);
paveRect(31, 13, 2, PLAZA.y - 13); // ขึ้นเหนือ ถึงถนนหน้าตึก
paveRect(31, PLAZA.y + PLAZA.h, 2, 42 - PLAZA.y - PLAZA.h); // ลงใต้ ถึงซอยบ้านซอยล่าง
paveRect(4, 23, PLAZA.x - 4, 2); // ไปตะวันตก
paveRect(PLAZA.x + PLAZA.w, 23, W - 4 - PLAZA.x - PLAZA.w, 2); // ไปตะวันออก

// ---- 📚 ย่านห้องสมุด (ตะวันตกเฉียงเหนือ): วัดเงียบๆ + ศาลเจ้า ล้อมด้วยต้นสน ----
const library = building('temple', 12, 8, { place: 'library' });
paveRect(library.doorX, library.bottom, 1, 23 - library.bottom);
const shrine = building('shrine', 20, 9, { place: 'shrine' });
paveRect(shrine.doorX, shrine.bottom, 1, 23 - shrine.bottom);
for (const [x, y] of [[5, 5], [7, 5], [5, 8], [5, 12], [7, 15], [25, 5], [27, 7], [9, 17], [17, 16], [24, 16]]) {
  smallTree(x, y, TREE.darkGreen);
}

// ---- ☕ ย่านคาเฟ่ (ตะวันออกเฉียงเหนือ): ร้านน้ำชา + ร้านราเมน ----
const tea = building('teaHouse', 40, 9, { place: 'cafe' });
paveRect(tea.doorX, tea.bottom, 1, 23 - tea.bottom);
const ramen = building('ramen', 48, 9, { place: 'ramen' });
paveRect(ramen.doorX, ramen.bottom, 1, 23 - ramen.bottom);
bigTree('orange', 55, 6);
paveRect(13, 13, 37, 2); // ถนนหน้าตึกฝั่งเหนือ: ห้องสมุด - ห้องสมาธิ - คาเฟ่ - ราเมน
for (const [x, y] of [[37, 5], [39, 15], [46, 16], [53, 16], [58, 12], [44, 5]]) smallTree(x, y);

// ---- 🏠 ย่านบ้าน (ตะวันตกเฉียงใต้): 6 หลัง ประตูทุกหลัง = บ้านของเรา ----
const homes = [
  ['houseOrange', 6, 28], ['houseBeige', 13, 28], ['woodHouse', 20, 28],
  ['houseBeige', 6, 36], ['houseOrange2', 13, 36], ['houseOrange', 20, 36],
];
paveRect(4, 33, 24, 1); // ถนนซอยระหว่างแถวบ้าน
paveRect(4, 41, 24, 1);
paveRect(4, 25, 1, 17); // เชื่อมซอยกับถนนหลัก
paveRect(28, 33, 3, 1); // ต่อซอยบ้านเข้าถนนลงใต้
paveRect(28, 41, 3, 1);
for (const [kind, x, y] of homes) {
  const h = building(kind, x, y, { isHome: true });
  paveRect(h.doorX, h.bottom, 1, (y < 33 ? 33 : 41) - h.bottom);
}

// ---- 🌸 สวน + ทะเลสาบ (ตะวันออกเฉียงใต้) ----
lake(44, 31, 13, 9);
bigTree('pink', 39, 30);
bigTree('pink', 58, 32);
bigTree('green', 39, 38);
for (const [x, y] of [[43, 42], [47, 42], [51, 42], [55, 42], [59, 28], [42, 27], [50, 27]]) smallTree(x, y, TREE.pink);
paveRect(PLAZA.x + PLAZA.w, 27, 4, 1); // ทางเดินเล่นจากลานไปสวน
paveRect(41, 27, 1, 3);
paveRect(33, 35, 11, 1); // ทางเดินจากถนนใต้ไปริมทะเลสาบ

// ---------- ป้ายย่าน (ชื่อลอยในเกม) + ตู้เกม + จุดเกิด ----------
const labels = [
  { name: 'label', text: '📚 ย่านห้องสมุด', x: 16 * 16, y: 6 * 16 },
  { name: 'label', text: '☕ ย่านคาเฟ่', x: 46 * 16, y: 7 * 16 },
  { name: 'label', text: '🏠 ย่านบ้าน', x: 16 * 16, y: 26.5 * 16 },
  { name: 'label', text: '🌸 สวนทะเลสาบ', x: 50 * 16, y: 29.5 * 16 },
];
// ป้ายบอกทางที่ขอบลาน (เห็นตั้งแต่จุดเกิด)
signs.push(
  { text: '↑ 📚 ห้องสมุด · ☕ คาเฟ่', x: (PLAZA.x + PLAZA.w / 2) * 16, y: (PLAZA.y + 0.6) * 16 },
  { text: '← 📚 ห้องสมุด · 🧘 สมาธิ', x: (PLAZA.x + 2.5) * 16, y: 22.3 * 16 },
  { text: '☕ คาเฟ่ · 🍜 ราเมน →', x: (PLAZA.x + PLAZA.w - 2.5) * 16, y: 22.3 * 16 },
  { text: '🌸 สวน →', x: (PLAZA.x + PLAZA.w - 1.5) * 16, y: 26.4 * 16 },
  { text: '↓ 🏠 ย่านบ้าน · 🌸 ทะเลสาบ', x: (PLAZA.x + PLAZA.w / 2) * 16, y: (PLAZA.y + PLAZA.h - 0.6) * 16 },
);
const arcade = { x: (PLAZA.x + PLAZA.w - 2) * 16, y: (PLAZA.y + 1) * 16 };
mark(PLAZA.x + PLAZA.w - 2, PLAZA.y + 1);
// ประตู 2x2 ช่องทางซ้ายล่างของลาน: ด่านคณิต และสนามรบ — ต้องตรงกับ EXITS ใน server/src/rooms/TownRoom.ts (เกิดใต้ประตู)
const gates = [
  { subject: 'math', text: '📐 ด่านคณิต', tx: PLAZA.x + 1 },
  { subject: 'arena', text: '⚔️ สนามรบ', tx: PLAZA.x + 4 },
].map((g) => {
  const ty = PLAZA.y + PLAZA.h - 4;
  mark(g.tx, ty, 2, 2);
  signs.push({ text: g.text, x: g.tx * 16 + 16, y: ty * 16 - 14 });
  return { subject: g.subject, x: g.tx * 16, y: ty * 16 };
});

applyDirt();

// ---------- ของตกแต่งแบบสุ่ม (หญ้าเล็ก ดอกไม้) บนพื้นหญ้าที่ว่าง ----------
const TUFTS = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => gid('detail', c, 2));
for (let y = 2; y < H - 2; y++) {
  for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    if (used[i]) continue;
    const r = rand();
    if (r < 0.012 && isFree(x - 1, y - 1, 4, 4)) smallTree(x, y);
    else if (r < 0.09) deco[i] = pick(TUFTS);
  }
}

// ---------- เขียนไฟล์ Tiled ----------
const tileLayer = (id, name, data, visible = true) => ({
  id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible, data,
});
let objId = 1;
const obj = (o) => ({ id: objId++, type: '', width: 0, height: 0, rotation: 0, visible: true, ...o });

const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
  width: W, height: H, tilewidth: 16, tileheight: 16, infinite: false, compressionlevel: -1,
  nextlayerid: 7,
  layers: [
    tileLayer(1, 'ground', ground),
    tileLayer(2, 'deco', deco),
    tileLayer(3, 'walls', walls),
    tileLayer(4, 'above', above),
    tileLayer(5, 'block', block, false),
    {
      id: 6, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown',
      objects: [
        obj({ name: 'spawn', x: (PLAZA.x + PLAZA.w / 2) * 16, y: (PLAZA.y + PLAZA.h / 2) * 16, point: true }),
        ...doors.map(({ place, ...d }) =>
          obj({ name: 'door', ...d, ...(place ? { properties: [{ name: 'place', type: 'string', value: place }] } : {}) }),
        ),
        obj({ name: 'arcade', ...arcade, width: 16, height: 16 }),
        ...gates.map(({ subject, ...g }) => obj({ name: 'gate', ...g, width: 32, height: 32, properties: [{ name: 'subject', type: 'string', value: subject }] })),
        ...labels.map((l) => obj({ name: 'label', x: l.x, y: l.y, point: true, properties: [{ name: 'text', type: 'string', value: l.text }] })),
        ...signs.map((l) => obj({ name: 'sign', x: l.x, y: l.y, point: true, properties: [{ name: 'text', type: 'string', value: l.text }] })),
      ],
    },
  ],
  tilesets: SETS.map((s) => ({
    firstgid: s.firstgid, name: s.name, image: `../tiles/ninja/${s.file}`, imagewidth: s.w, imageheight: s.h,
    columns: s.cols, tilecount: s.cols * s.rows, tilewidth: 16, tileheight: 16, margin: 0, spacing: 0,
  })),
};
map.nextobjectid = objId;

writeFileSync(new URL('../public/assets/maps/town.json', import.meta.url), JSON.stringify(map));
console.log(`สร้าง town.json แล้ว (${W}x${H} ช่อง, ประตู ${doors.length} บาน)`);
