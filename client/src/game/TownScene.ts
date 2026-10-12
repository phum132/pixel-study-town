import Phaser from 'phaser';
import { WorldScene } from './WorldScene';
import { depthAt, makeLabel } from './avatar';

const DOOR_COOLDOWN_MS = 1500;
// ชุดภาพ Ninja Adventure ที่แผนที่ใช้ (ชื่อต้องตรงกับ tilesets ใน town.json / tools/make-town-map.mjs)
const TILESETS = {
  floor: 'TilesetFloor.png',
  water: 'TilesetWater.png',
  nature: 'TilesetNature.png',
  house: 'TilesetHouse.png',
  detail: 'TilesetFloorDetail.png',
};
const REACH = 22; // ยืนห่างตู้เกม/ประตูด่านไม่เกินนี้ (พิกเซล) ถึงจะกดใช้ได้

// ของที่เดินไปใกล้ๆ แล้วกด E หรือแตะเพื่อใช้ได้
type Usable = { x: number; y: number; hint: Phaser.GameObjects.Text; use: () => void };

// ฉากเมือง 4 ย่าน: แผนที่จาก Tiled + ประตูบ้าน (เดินชนประตูจากด้านล่าง = เข้าบ้านตัวเอง) + ป้ายย่าน + ตู้เกม Snake + ประตูด่านคณิต
export class TownScene extends WorldScene {
  // place = id ตึกสาธารณะ (ว่าง = ประตูบ้าน เข้าบ้านตัวเอง)
  private doors: { rect: Phaser.Geom.Rectangle; place: string }[] = [];
  private lastDoorAt = 0;
  private usables: Usable[] = [];
  private keyE!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('TownScene');
  }

  preload() {
    super.preload();
    for (const [name, file] of Object.entries(TILESETS)) this.load.image(`ninja-${name}`, `assets/tiles/ninja/${file}`);
    this.load.tilemapTiledJSON('town', 'assets/maps/town.json');
  }

  protected buildWorld() {
    const map = this.make.tilemap({ key: 'town' });
    const tiles = Object.keys(TILESETS).map((name) => map.addTilesetImage(name, `ninja-${name}`)!);
    map.createLayer('ground', tiles)!.setDepth(0);
    map.createLayer('deco', tiles)!.setDepth(0.5);
    const walls = map.createLayer('walls', tiles)!.setDepth(1);
    map.createLayer('above', tiles)!.setDepth(10);
    const block = map.createLayer('block', tiles)!.setVisible(false); // กำแพงล่องหน เช่น น้ำในทะเลสาบ
    walls.setCollisionByExclusion([-1]); // ทุกช่องในชั้น walls และ block ชนได้
    block.setCollisionByExclusion([-1]);

    // ป้ายชื่อย่าน (label ตัวใหญ่) และป้ายบอกทาง/หน้าตึก (sign) — วัตถุมีค่า text
    // ความลึก 15 = เหนือหลังคา/ยอดไม้ (10) แต่ใต้ชื่อผู้เล่น (20)
    for (const o of map.filterObjects('objects', (o) => o.name === 'label' || o.name === 'sign') ?? []) {
      const text = (o.properties as { name: string; value: string }[] | undefined)?.find((p) => p.name === 'text')?.value;
      if (!text) continue;
      const big = o.name === 'label';
      const touch = this.sys.game.device.input.touch; // มือถือจอเล็ก เกมถูกย่อ จึงขยายตัวหนังสือให้อ่านออก
      const size = big ? (touch ? 44 : 36) : touch ? 36 : 28;
      makeLabel(this, text, big ? '#fff3c4' : '#ffffff', { fontSize: `${size}px`, strokeThickness: big ? 6 : 5 })
        .setOrigin(0.5)
        .setPosition(o.x!, o.y!)
        .setDepth(15);
    }

    // วัตถุในชั้น objects (ย้ายตำแหน่งได้ในโปรแกรม Tiled)
    this.doors = map
      .filterObjects('objects', (o) => o.name === 'door')!
      .map((o) => ({
        rect: new Phaser.Geom.Rectangle(o.x!, o.y!, o.width!, o.height!),
        place: ((o.properties as { name: string; value: string }[] | undefined)?.find((p) => p.name === 'place')?.value) ?? '',
      }));

    const colliders: Phaser.Types.Physics.Arcade.ArcadeColliderType[] = [walls, block];
    const spot = map.findObject('objects', (o) => o.name === 'arcade');
    if (spot) colliders.push(this.buildArcade(spot.x!, spot.y!));
    const gate = map.findObject('objects', (o) => o.name === 'gate');
    if (gate) colliders.push(this.buildGate(gate.x!, gate.y!));
    this.keyE = this.input.keyboard!.addKey('E', false);

    return { width: map.widthInPixels, height: map.heightInPixels, colliders, zoom: 2, followCamera: true };
  }

  // ตู้เกมสูง 1.5 ช่อง ฐานอยู่ในช่อง (x, y) กดที่ตู้ หรือยืนใกล้แล้วกด E = เปิดเกม
  private buildArcade(x: number, y: number) {
    const sprite = this.add.image(x, y + 16, arcadeTexture(this)).setOrigin(0, 1).setDepth(depthAt(y + 16));
    sprite.setInteractive({ useHandCursor: true });

    const touch = this.sys.game.device.input.touch; // มือถือไม่มีปุ่ม E
    const hint = makeLabel(this, touch ? 'แตะตู้ หรือกด E 🐍' : 'กด E เล่น 🐍', '#ffcf5c').setOrigin(0.5, 1).setPosition(x + 8, y - 10).setVisible(false);
    const usable: Usable = { x: x + 8, y: y + 8, hint, use: () => this.bridge.emit('open-arcade') };
    this.usables.push(usable);
    sprite.on('pointerdown', () => this.tryUse(usable));

    const block = this.add.zone(x, y + 4, 16, 12).setOrigin(0);
    this.physics.add.existing(block, true);
    return block;
  }

  // ประตูด่านคณิตกว้าง 2 ช่อง สูง 2 ช่อง (x, y = มุมซ้ายบน) เข้าได้จากด้านล่าง
  private buildGate(x: number, y: number) {
    const sprite = this.add.image(x, y + 32, gateTexture(this)).setOrigin(0, 1).setDepth(depthAt(y + 32));
    sprite.setInteractive({ useHandCursor: true });
    const touch = this.sys.game.device.input.touch;
    const hint = makeLabel(this, touch ? 'แตะประตู หรือกด E ⚔️' : 'กด E เข้าด่าน ⚔️', '#ffcf5c').setOrigin(0.5, 1).setPosition(x + 16, y - 22).setVisible(false); // ลอยเหนือป้ายชื่อประตู
    const usable: Usable = { x: x + 16, y: y + 30, hint, use: () => this.bridge.emit('open-gate', 'math') };
    this.usables.push(usable);
    sprite.on('pointerdown', () => this.tryUse(usable));

    // ฐานประตูเดินทะลุไม่ได้ ยืนหน้าประตูแล้วกด E (หรือแตะ) เพื่อเข้า
    const block = this.add.zone(x, y + 20, 32, 12).setOrigin(0);
    this.physics.add.existing(block, true);
    return block;
  }

  private near(u: Usable) {
    const { x, y } = this.me.sprite;
    return Phaser.Math.Distance.Between(x, y + 4, u.x, u.y) < REACH;
  }

  private tryUse(u: Usable) {
    if (this.near(u)) u.use();
  }

  protected afterUpdate() {
    // ต้องอ่าน JustDown ทุกเฟรม ไม่งั้น Phaser จะจำการกด E ค้างไว้ แล้วตู้เปิดเองตอนเดินมาถึง
    const pressedE = Phaser.Input.Keyboard.JustDown(this.keyE);
    for (const u of this.usables) {
      const near = this.near(u);
      u.hint.setVisible(near);
      if (pressedE && near && !this.isTyping()) u.use(); // พิมพ์ตัว e/ำ ในแชทต้องไม่เปิดตู้
    }

    const { x, y } = this.me.sprite;
    const now = this.time.now;
    if (this.dir !== 'up' || now - this.lastDoorAt < DOOR_COOLDOWN_MS) return;
    const door = this.doors.find((d) => d.rect.contains(x, y + 4));
    if (door) {
      this.lastDoorAt = now;
      if (door.place) this.bridge.emit('enter-place', door.place);
      else this.bridge.emit('enter-home');
    }
  }
}

// ภาพตู้เกม 16x24 วาดด้วยโค้ด (ชุดภาพไม่มีตู้เกม)
function arcadeTexture(scene: Phaser.Scene) {
  const key = 'arcade-cabinet';
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 16, 24)!;
  const ctx = tex.getContext();
  const rect = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  rect('#2b1d26', 1, 0, 14, 24); // เส้นขอบ
  rect('#6b4fa3', 2, 1, 12, 22); // ตัวตู้
  rect('#ffcf5c', 2, 1, 12, 3); // ป้ายด้านบน
  rect('#2b1d26', 3, 5, 10, 8); // กรอบจอ
  rect('#1d2b1f', 4, 6, 8, 6); // จอ
  rect('#8be08b', 5, 9, 4, 1); // งูบนจอ
  rect('#8be08b', 8, 7, 1, 2);
  rect('#e04f5f', 10, 7, 1, 1); // แอปเปิล
  rect('#4a3d66', 2, 14, 12, 4); // แผงปุ่ม
  rect('#2b1d26', 4, 15, 1, 2); // จอยสติ๊ก
  rect('#e04f5f', 4, 14, 1, 1);
  rect('#e04f5f', 9, 15, 2, 2); // ปุ่ม
  rect('#4fd1c5', 12, 15, 1, 2);
  rect('#523b80', 2, 19, 12, 4); // ฐานตู้
  tex.refresh();
  return key;
}

// ภาพประตูด่านคณิต 32x32 วาดด้วยโค้ด: ซุ้มประตูหิน หลังคาแดง ข้างในเป็นประตูวนสีม่วง มีเครื่องหมายบวกลบคูณหาร
function gateTexture(scene: Phaser.Scene) {
  const key = 'math-gate';
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 32, 32)!;
  const ctx = tex.getContext();
  const rect = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  rect('#2b1d26', 0, 2, 32, 6); // หลังคา (เส้นขอบ)
  rect('#c94a4a', 1, 3, 30, 4);
  rect('#e86a5a', 1, 3, 30, 1);
  rect('#2b1d26', 3, 8, 26, 2); // คาน
  rect('#2b1d26', 3, 10, 7, 22); // เสาซ้าย
  rect('#8a8399', 4, 10, 5, 21);
  rect('#a9a2b8', 4, 10, 1, 21);
  rect('#2b1d26', 22, 10, 7, 22); // เสาขวา
  rect('#8a8399', 23, 10, 5, 21);
  rect('#a9a2b8', 23, 10, 1, 21);
  rect('#3d2a6b', 10, 10, 12, 22); // ประตูวน
  rect('#6b4fa3', 11, 12, 10, 19);
  rect('#9b7fe0', 13, 14, 6, 15);
  rect('#c9b8ff', 15, 17, 2, 9);
  rect('#ffcf5c', 12, 4, 8, 1); // ป้าย + − × ÷ บนหลังคา
  rect('#ffcf5c', 15, 3, 2, 3);
  rect('#2b1d26', 13, 31, 6, 1);
  tex.refresh();
  return key;
}
