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
const ARCADE_REACH = 22; // ยืนห่างตู้เกมไม่เกินนี้ (พิกเซล) ถึงจะกดเล่นได้

// ฉากเมือง 4 ย่าน: แผนที่จาก Tiled + ประตูบ้าน (เดินชนประตูจากด้านล่าง = เข้าบ้านตัวเอง) + ป้ายย่าน + ตู้เกม Snake
export class TownScene extends WorldScene {
  // place = id ตึกสาธารณะ (ว่าง = ประตูบ้าน เข้าบ้านตัวเอง)
  private doors: { rect: Phaser.Geom.Rectangle; place: string }[] = [];
  private lastDoorAt = 0;
  private arcade?: { x: number; y: number; hint: Phaser.GameObjects.Text };
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
    this.keyE = this.input.keyboard!.addKey('E', false);

    return { width: map.widthInPixels, height: map.heightInPixels, colliders, zoom: 2, followCamera: true };
  }

  // ตู้เกมสูง 1.5 ช่อง ฐานอยู่ในช่อง (x, y) กดที่ตู้ หรือยืนใกล้แล้วกด E = เปิดเกม
  private buildArcade(x: number, y: number) {
    const sprite = this.add.image(x, y + 16, arcadeTexture(this)).setOrigin(0, 1).setDepth(depthAt(y + 16));
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', () => this.openArcade());

    const touch = this.sys.game.device.input.touch; // มือถือไม่มีปุ่ม E
    const hint = makeLabel(this, touch ? 'แตะตู้ หรือกด E 🐍' : 'กด E เล่น 🐍', '#ffcf5c').setOrigin(0.5, 1).setPosition(x + 8, y - 10).setVisible(false);
    this.arcade = { x: x + 8, y: y + 8, hint };

    const block = this.add.zone(x, y + 4, 16, 12).setOrigin(0);
    this.physics.add.existing(block, true);
    return block;
  }

  private nearArcade() {
    if (!this.arcade) return false;
    const { x, y } = this.me.sprite;
    return Phaser.Math.Distance.Between(x, y + 4, this.arcade.x, this.arcade.y) < ARCADE_REACH;
  }

  private openArcade() {
    if (this.nearArcade()) this.bridge.emit('open-arcade');
  }

  protected afterUpdate() {
    // ต้องอ่าน JustDown ทุกเฟรม ไม่งั้น Phaser จะจำการกด E ค้างไว้ แล้วตู้เปิดเองตอนเดินมาถึง
    const pressedE = Phaser.Input.Keyboard.JustDown(this.keyE);
    const near = this.nearArcade();
    this.arcade?.hint.setVisible(near);
    if (pressedE && near && !this.isTyping()) this.openArcade(); // พิมพ์ตัว e/ำ ในแชทต้องไม่เปิดตู้

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
