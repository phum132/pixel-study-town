import Phaser from 'phaser';
import { WorldScene } from './WorldScene';

const DOOR_COOLDOWN_MS = 1500;

// ฉากเมือง: แผนที่จาก Tiled + ประตูบ้าน (เดินชนประตูจากด้านล่าง = เข้าบ้านตัวเอง)
export class TownScene extends WorldScene {
  private doors: Phaser.Geom.Rectangle[] = [];
  private lastDoorAt = 0;

  constructor() {
    super('TownScene');
  }

  preload() {
    this.load.image('tiny-town', 'assets/tiles/tiny-town.png');
    this.load.tilemapTiledJSON('town', 'assets/maps/town.json');
  }

  protected buildWorld() {
    const map = this.make.tilemap({ key: 'town' });
    const tiles = map.addTilesetImage('tiny-town', 'tiny-town')!;
    map.createLayer('ground', tiles)!.setDepth(0);
    const walls = map.createLayer('walls', tiles)!.setDepth(1);
    map.createLayer('above', tiles)!.setDepth(10);
    walls.setCollisionByExclusion([-1]); // ทุกช่องในชั้น walls ชนได้

    // วัตถุชื่อ door ในชั้น objects (ย้ายตำแหน่งได้ในโปรแกรม Tiled)
    this.doors = map
      .filterObjects('objects', (o) => o.name === 'door')!
      .map((o) => new Phaser.Geom.Rectangle(o.x!, o.y!, o.width!, o.height!));

    return { width: map.widthInPixels, height: map.heightInPixels, colliders: [walls], zoom: 2, followCamera: true };
  }

  protected afterUpdate() {
    const { x, y } = this.me.sprite;
    const now = this.time.now;
    if (this.dir !== 'up' || now - this.lastDoorAt < DOOR_COOLDOWN_MS) return;
    if (this.doors.some((d) => d.contains(x, y + 4))) {
      this.lastDoorAt = now;
      this.bridge.emit('enter-home');
    }
  }
}
