import Phaser from 'phaser';
import { ensureWalkAnims, textureKey } from './character';
import { DIR_COLUMN } from '../lib/characters';

export type Dir = 'down' | 'up' | 'left' | 'right';
const BUBBLE_MS = 5000;

// ตัวละครหนึ่งตัวบนจอ (ทั้งของเราและของคนอื่น): ภาพ + ป้ายชื่อ + บับเบิลแชท
export class Avatar {
  sprite: Phaser.Physics.Arcade.Sprite;
  private scene: Phaser.Scene;
  private nameTag: Phaser.GameObjects.Text;
  private bubble?: Phaser.GameObjects.Text;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private textureKey: string;
  private name: string;
  private focusing = false;

  // character = ชื่อตัวละครใน lib/characters.ts (แผ่นภาพโหลดไว้แล้วใน preload ของฉาก)
  constructor(scene: Phaser.Scene, x: number, y: number, name: string, character: string) {
    this.scene = scene;
    this.textureKey = textureKey(character);
    ensureWalkAnims(scene, character);
    this.sprite = scene.physics.add.sprite(x, y, this.textureKey, 0);
    this.name = name;
    this.nameTag = makeLabel(scene, name, '#ffffff').setOrigin(0.5, 1);
  }

  // กำลังโฟกัส: ขึ้น 📖 หน้าชื่อ และชื่อเป็นสีทอง
  setFocusing(on: boolean) {
    if (on === this.focusing) return;
    this.focusing = on;
    this.nameTag.setText(on ? `📖 ${this.name}` : this.name).setColor(on ? '#ffcf5c' : '#ffffff');
  }

  // แผ่นภาพมีครบทั้ง 4 ทิศ (ไม่ต้องกลับด้านภาพ) ยืนนิ่ง = เฟรมแรกของทิศนั้น
  setPose(dir: Dir, moving: boolean) {
    if (moving) {
      this.sprite.anims.play(`${this.textureKey}-walk-${dir}`, true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(DIR_COLUMN[dir]);
    }
  }

  say(text: string) {
    this.bubble?.destroy();
    this.bubbleTimer?.remove();
    const short = text.length > 60 ? text.slice(0, 57) + '...' : text;
    this.bubble = makeLabel(this.scene, short, '#2b1d26', {
      backgroundColor: '#fff8e7',
      padding: { x: 10, y: 6 },
      wordWrap: { width: 480, useAdvancedWrap: true },
      strokeThickness: 0,
    }).setOrigin(0.5, 1);
    this.bubbleTimer = this.scene.time.delayedCall(BUBBLE_MS, () => this.bubble?.destroy());
    this.follow();
  }

  // ให้ป้ายชื่อ/บับเบิลตามตัวละคร และเรียงความลึกตามตำแหน่งเท้า (อะไรอยู่ล่างกว่าจะทับของที่อยู่บน)
  follow() {
    const { x, y } = this.sprite;
    this.sprite.setDepth(depthAt(y + 8));
    this.nameTag.setPosition(x, y - 8);
    this.bubble?.setPosition(x, y - 15);
  }

  destroy() {
    this.sprite.destroy();
    this.nameTag.destroy();
    this.bubble?.destroy();
    this.bubbleTimer?.remove();
  }
}

// ความลึกของสิ่งของที่ยืนบนพื้น ตามตำแหน่งขอบล่าง (ตัวละครและเฟอร์นิเจอร์ใช้สูตรเดียวกัน)
export function depthAt(bottomY: number) {
  return 5 + bottomY / 10000;
}

// ตัวหนังสือ: ฟอนต์ใหญ่แล้วย่อลง 4 เท่า และใช้การกรองแบบเนียน จะได้คมตอนกล้องซูม
export function makeLabel(scene: Phaser.Scene, text: string, color: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  const label = scene.add
    .text(0, 0, text, { fontFamily: 'Itim, sans-serif', fontSize: '24px', color, stroke: '#2b1d26', strokeThickness: 4, ...style })
    .setScale(0.25)
    .setDepth(20);
  label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return label;
}

