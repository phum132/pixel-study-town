// สร้างแผนที่เมืองเป็นไฟล์ Tiled JSON (public/assets/maps/town.json)
// รัน: npm run map   — คำเตือน: จะเขียนทับ town.json ถ้าแก้ใน Tiled ไปแล้วอย่ารันซ้ำ
import { writeFileSync } from 'node:fs';

const W = 40;
const H = 30;

// เลขช่องใน tiny-town.png (นับจากซ้ายบน แถวละ 12 ช่อง เริ่มที่ 0)
const T = {
  grass: 0, grassTuft: 1, flowers: 2,
  dirt: { tl: 12, t: 13, tr: 14, l: 24, c: 25, r: 26, bl: 36, b: 37, br: 38 },
  stonePath: 43,
  treeTop: 4, treeTrunk: 16, smallTree: 28, smallOrangeTree: 27, bush: 5, mushroom: 29,
  fence: [44, 45, 46, 47],
  well: 104, sign: 83, beehive: 94, target: 95,
  houseBlue: [[48, 49, 50, 51], [60, 61, 62, 63], [84, 73, 73, 85]],
  houseRed: [[52, 53, 54, 55], [64, 65, 66, 67], [88, 77, 77, 89]],
};

const layer = () => new Array(W * H).fill(-1);
const ground = layer().fill(T.grass);
const walls = layer(); // ชนได้ เดินทะลุไม่ได้
const above = layer(); // วาดทับตัวละคร (ยอดไม้ หลังคา)
const reserved = new Array(W * H).fill(false); // ช่องที่ห้ามสุ่มของตกแต่งลงไป

const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const set = (arr, x, y, t) => { if (inMap(x, y)) arr[y * W + x] = t; };
const reserve = (x, y, w = 1, h = 1) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) reserved[j * W + i] = true;
};

// สุ่มแบบมี seed เพื่อให้รันกี่ครั้งก็ได้แผนที่เหมือนเดิม
let seed = 1234;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// --- ป่ารอบขอบแผนที่ ---
function tree(x, y) {
  set(above, x, y, T.treeTop);
  set(walls, x, y + 1, T.treeTrunk);
  reserve(x, y, 1, 2);
}
for (let x = 0; x < W; x++) { tree(x, 0); tree(x, H - 3); set(walls, x, H - 1, T.bush); reserve(x, H - 1); }
for (let y = 2; y < H - 3; y += 2) { tree(0, y); tree(W - 1, y); }

// --- ถนนหิน ---
const path = (x, y) => { set(ground, x, y, T.stonePath); reserve(x, y); };
for (let x = 2; x < W - 2; x++) { path(x, 9); path(x, 24); }
for (let y = 9; y <= 24; y++) { path(19, y); path(20, y); }

// --- ลานกลางเมือง (ดิน) ---
const px = 14, py = 12, pw = 12, ph = 7;
for (let y = py; y < py + ph; y++) {
  for (let x = px; x < px + pw; x++) {
    const top = y === py, bot = y === py + ph - 1, left = x === px, right = x === px + pw - 1;
    const d = T.dirt;
    const t = top ? (left ? d.tl : right ? d.tr : d.t)
      : bot ? (left ? d.bl : right ? d.br : d.b)
      : left ? d.l : right ? d.r : d.c;
    set(ground, x, y, t);
  }
}
reserve(px - 1, py - 1, pw + 2, ph + 2);
set(walls, 22, 14, T.well);
set(walls, 16, 13, T.sign);

// --- บ้าน 4 หลัง (ประตูอยู่ช่องขวาสุดของแถวล่าง) ---
const doors = []; // ตำแหน่งประตู: เดินชนจากด้านล่าง = เข้าบ้านตัวเอง
function house(x, y, tiles) {
  tiles.forEach((row, j) => row.forEach((t, i) => set(j === 0 ? above : walls, x + i, y + j, t)));
  // หลังคาแถวบนวาดทับตัวละคร แต่ยังต้องชน จึงใส่กำแพงล่องหนใต้มันด้วย
  for (let i = 0; i < 4; i++) set(walls, x + i, y, tiles[1][i]);
  reserve(x - 1, y - 1, 6, 5);
  doors.push({ x: (x + 3) * 16, y: (y + 3) * 16 - 2, width: 16, height: 10 });
  for (let yy = y + 3; yy < (y < 15 ? 9 : 24); yy++) path(x + 3, yy); // ทางเดินจากประตูไปถนน
}
house(5, 5, T.houseBlue);
house(30, 5, T.houseRed);
house(5, 20, T.houseRed);
house(30, 20, T.houseBlue);

// --- รั้วกับฟาร์มผึ้งมุมขวา ---
for (let x = 27; x <= 34; x++) set(walls, x, 15, T.fence[x === 27 ? 0 : x === 34 ? 2 : 1]);
set(walls, 29, 13, T.beehive);
set(walls, 32, 13, T.beehive);
set(walls, 9, 14, T.target);
reserve(26, 12, 10, 5);
reserve(8, 13, 3, 3);

// --- ของตกแต่งแบบสุ่ม ---
for (let y = 2; y < H - 3; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (reserved[i]) continue;
    const r = rand();
    if (r < 0.04) { set(walls, x, y, rand() < 0.7 ? T.smallTree : T.smallOrangeTree); reserve(x - 1, y - 1, 3, 3); }
    else if (r < 0.06) set(walls, x, y, T.bush);
    else if (r < 0.07) set(walls, x, y, T.mushroom);
    else if (r < 0.15) set(ground, x, y, T.grassTuft);
    else if (r < 0.2) set(ground, x, y, T.flowers);
  }
}

// --- แปลงเป็นรูปแบบ Tiled (gid = เลขช่อง + 1, 0 = ว่าง) ---
const tileLayer = (id, name, arr) => ({
  id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true,
  data: arr.map((t) => t + 1),
});

const map = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
  width: W, height: H, tilewidth: 16, tileheight: 16, infinite: false, compressionlevel: -1,
  nextlayerid: 5, nextobjectid: 6,
  layers: [
    tileLayer(1, 'ground', ground),
    tileLayer(2, 'walls', walls),
    tileLayer(3, 'above', above),
    {
      id: 4, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown',
      objects: [
        { id: 1, name: 'spawn', type: '', x: 19.5 * 16, y: 16 * 16, width: 0, height: 0, point: true, rotation: 0, visible: true },
        ...doors.map((d, n) => ({ id: 2 + n, name: 'door', type: '', ...d, rotation: 0, visible: true })),
      ],
    },
  ],
  tilesets: [{
    firstgid: 1, name: 'tiny-town', image: '../tiles/tiny-town.png', imagewidth: 192, imageheight: 176,
    columns: 12, tilecount: 132, tilewidth: 16, tileheight: 16, margin: 0, spacing: 0,
  }],
};

writeFileSync(new URL('../public/assets/maps/town.json', import.meta.url), JSON.stringify(map));
console.log(`สร้าง town.json แล้ว (${W}x${H} ช่อง)`);
