import Phaser from 'phaser';
import { WorldScene } from './WorldScene';
import { depthAt } from './avatar';
import { drawRug, frameOf, FURNITURE_BY_ID, shade, type Furniture } from '../lib/furniture';
import {
  canPlace,
  DEFAULT_LAYOUT,
  DEFAULT_THEME,
  DOOR_COLS,
  itemAt,
  ROOM_COLS,
  ROOM_ROWS,
  WALL_ROWS,
  type FloorStyle,
  type HomeData,
  type Placed,
  type WallStyle,
} from '../lib/home';

const T = 16;
const W = ROOM_COLS * T;
const H = ROOM_ROWS * T;
const EXIT_COOLDOWN_MS = 1500;

// เครื่องมือตอนแต่งห้อง: id เฟอร์นิเจอร์ที่จะวาง, 'erase' = ลบ, null = ไม่ได้แต่ง
export type EditTool = string | 'erase' | null;

// ฉากบ้าน: วาดพื้น/ผนังตามธีม วางเฟอร์นิเจอร์ตาม layout และโหมดแต่งห้องของเจ้าของ
export class HomeScene extends WorldScene {
  private home!: HomeData;
  private floor!: Phaser.GameObjects.TileSprite;
  private wall!: Phaser.GameObjects.TileSprite;
  private furniture: Phaser.GameObjects.GameObject[] = [];
  private blockers!: Phaser.Physics.Arcade.StaticGroup;
  private tool: EditTool = null;
  private grid!: Phaser.GameObjects.Graphics;
  private hover!: Phaser.GameObjects.Graphics;
  private enteredAt = 0;

  constructor() {
    super('HomeScene');
  }

  preload() {
    this.load.spritesheet('indoor', 'assets/tiles/roguelike-indoor.png', { frameWidth: 16, frameHeight: 16, spacing: 1 });
  }

  protected buildWorld() {
    this.home = this.initData.home ?? { theme: DEFAULT_THEME, layout: DEFAULT_LAYOUT, isPublic: true };
    this.enteredAt = this.time.now;

    this.wall = this.add.tileSprite(0, 0, W, WALL_ROWS * T, '__DEFAULT').setOrigin(0).setDepth(0);
    this.floor = this.add.tileSprite(0, WALL_ROWS * T, W, H - WALL_ROWS * T, '__DEFAULT').setOrigin(0).setDepth(0);
    // บัวเชิงผนัง + พรมเช็ดเท้าหน้าประตู
    this.add.rectangle(0, WALL_ROWS * T - 3, W, 3, 0x5a3d2b).setOrigin(0).setDepth(0.5);
    this.add.rectangle(DOOR_COLS[0] * T + 2, H - 5, DOOR_COLS.length * T - 4, 5, 0x3a2a20).setOrigin(0).setDepth(0.5);

    // ผนังด้านบนเดินเข้าไปไม่ได้
    const wallBlock = this.add.zone(W / 2, (WALL_ROWS * T) / 2, W, WALL_ROWS * T);
    this.physics.add.existing(wallBlock, true);
    this.blockers = this.physics.add.staticGroup();

    this.grid = this.add.graphics().setDepth(30).setVisible(false);
    this.grid.lineStyle(1, 0xffffff, 0.25);
    for (let x = 0; x <= ROOM_COLS; x++) this.grid.lineBetween(x * T, 0, x * T, H);
    for (let y = 0; y <= ROOM_ROWS; y++) this.grid.lineBetween(0, y * T, W, y * T);
    this.grid.lineStyle(1, 0xffcf5c, 0.8).lineBetween(0, WALL_ROWS * T, W, WALL_ROWS * T);
    this.hover = this.add.graphics().setDepth(31);

    this.render();
    this.listen('home-preview', (data: HomeData) => {
      this.home = data;
      this.render();
    });
    this.listen('edit-tool', (tool: EditTool) => {
      this.tool = tool;
      this.pointerWalk = tool === null;
      this.grid.setVisible(tool !== null);
      this.hover.clear();
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.drawHover(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.tool === null) return;
      const cell = this.cellAt(p);
      if (cell) this.bridge.emit('tile-click', cell);
    });

    return { width: W, height: H, colliders: [wallBlock, this.blockers], zoom: 3, followCamera: false };
  }

  protected afterUpdate() {
    // เดินลงไปชนขอบล่างตรงประตู = ออกจากบ้าน
    const { x, y } = this.me.sprite;
    const atDoor = x > DOOR_COLS[0] * T && x < (DOOR_COLS[DOOR_COLS.length - 1] + 1) * T;
    const now = this.time.now;
    if (this.dir === 'down' && atDoor && y + 8 >= H - 1 && now - this.enteredAt > EXIT_COOLDOWN_MS) {
      this.enteredAt = now;
      this.bridge.emit('exit-home');
    }
  }

  private cellAt(p: Phaser.Input.Pointer) {
    const x = Math.floor(p.worldX / T);
    const y = Math.floor(p.worldY / T);
    return x >= 0 && y >= 0 && x < ROOM_COLS && y < ROOM_ROWS ? { x, y } : null;
  }

  // กรอบตัวอย่างตอนเลื่อนเมาส์: เขียว = วางได้, แดง = วางไม่ได้, เหลือง = ของที่จะถูกลบ
  private drawHover(p: Phaser.Input.Pointer) {
    this.hover.clear();
    const cell = this.cellAt(p);
    if (!cell || this.tool === null) return;
    if (this.tool === 'erase') {
      const n = itemAt(this.home.layout, cell.x, cell.y);
      if (n < 0) return;
      const placed = this.home.layout[n];
      const item = FURNITURE_BY_ID.get(placed.i)!;
      this.hover.lineStyle(1, 0xffcf5c, 1).strokeRect(placed.x * T, placed.y * T, item.w * T, item.h * T);
      return;
    }
    const item = FURNITURE_BY_ID.get(this.tool);
    if (!item) return;
    const ok = canPlace(this.home.layout, item, cell.x, cell.y);
    this.hover.fillStyle(ok ? 0x8be08b : 0xff7a7a, 0.35).fillRect(cell.x * T, cell.y * T, item.w * T, item.h * T);
    this.hover.lineStyle(1, ok ? 0x8be08b : 0xff7a7a, 1).strokeRect(cell.x * T, cell.y * T, item.w * T, item.h * T);
  }

  // วาดห้องใหม่ทั้งหมดจากข้อมูลล่าสุด (ธีม + เฟอร์นิเจอร์)
  private render() {
    const { theme, layout } = this.home;
    this.floor.setTexture(floorTexture(this, theme.floor, theme.floorColor));
    this.wall.setTexture(wallTexture(this, theme.wall, theme.wallColor));

    this.furniture.forEach((o) => o.destroy());
    this.furniture = [];
    this.blockers.clear(true, true);
    layout.forEach((p) => this.place(p));
  }

  private place(p: Placed) {
    const item = FURNITURE_BY_ID.get(p.i);
    if (!item) return;
    const px = p.x * T;
    const py = p.y * T;

    if (item.kind === 'rug') {
      const key = rugTexture(this, item);
      this.furniture.push(this.add.image(px, py, key).setOrigin(0).setDepth(1));
      return;
    }

    const depth = item.kind === 'wall' ? 2 : depthAt(py + item.h * T);
    for (let dy = 0; dy < item.h; dy++) {
      for (let dx = 0; dx < item.w; dx++) {
        const img = this.add.image(px + dx * T, py + dy * T, 'indoor', frameOf(item, dx, dy)).setOrigin(0).setDepth(depth);
        this.furniture.push(img);
      }
    }

    // ของบนพื้นเดินชน (เว้นขอบบน 6px ไว้ให้ตัวละครเดินไปยืนหลังของได้นิดหน่อย)
    if (item.kind === 'floor') {
      const block = this.add.zone(px, py + 6, item.w * T, item.h * T - 6).setOrigin(0);
      this.blockers.add(block); // ถูกลบพร้อม blockers.clear() ตอนวาดห้องใหม่
    }
  }
}

// ---------- ลายพื้น/ผนัง/พรม วาดด้วยโค้ด (ชุดภาพไม่มีพื้นและผนังให้) ----------

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w, h)!;
    draw(tex.getContext());
    tex.refresh();
  }
  return key;
}

function floorTexture(scene: Phaser.Scene, style: FloorStyle, color: string) {
  return canvasTexture(scene, `floor-${style}-${color}`, 16, 16, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 16);
    if (style === 'wood') {
      // แผ่นไม้: เส้นแนวนอนทุก 4px และรอยต่อสลับตำแหน่งกันแต่ละแถว
      ctx.fillStyle = shade(color, -0.2);
      [0, 8, 4, 12].forEach((seam, row) => {
        ctx.fillRect(0, row * 4 + 3, 16, 1);
        ctx.fillRect(seam, row * 4, 1, 3);
      });
      ctx.fillStyle = shade(color, 0.1);
      [1, 9, 5, 13].forEach((x, row) => ctx.fillRect(x + 2, row * 4 + 1, 3, 1));
    } else if (style === 'tile') {
      ctx.fillStyle = shade(color, 0.12);
      ctx.fillRect(0, 0, 8, 8);
      ctx.fillRect(8, 8, 8, 8);
      ctx.fillStyle = shade(color, -0.25);
      ctx.fillRect(0, 0, 16, 1);
      ctx.fillRect(0, 0, 1, 16);
      ctx.fillRect(0, 8, 16, 1);
      ctx.fillRect(8, 0, 1, 16);
    } else {
      ctx.fillStyle = shade(color, -0.1);
      [[2, 3], [9, 1], [13, 6], [5, 9], [11, 12], [1, 14], [7, 5]].forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
      ctx.fillStyle = shade(color, 0.12);
      [[4, 1], [12, 3], [8, 10], [3, 12], [14, 14]].forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
    }
  });
}

function wallTexture(scene: Phaser.Scene, style: WallStyle, color: string) {
  return canvasTexture(scene, `wall-${style}-${color}`, 16, 32, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 32);
    ctx.fillStyle = shade(color, -0.08);
    if (style === 'stripe') {
      ctx.fillRect(0, 0, 4, 32);
      ctx.fillRect(8, 0, 4, 32);
    } else if (style === 'dots') {
      [[3, 4], [11, 12], [3, 20], [11, 28]].forEach(([x, y]) => ctx.fillRect(x, y, 2, 2));
    }
    // ขอบบนเข้ม ให้ดูเป็นเพดาน
    ctx.fillStyle = shade(color, -0.45);
    ctx.fillRect(0, 0, 16, 2);
  });
}

function rugTexture(scene: Phaser.Scene, item: Furniture) {
  return canvasTexture(scene, `rug-${item.id}`, item.w * 16, item.h * 16, (ctx) => drawRug(ctx, item, 0, 0));
}
