import Phaser from 'phaser';
import { getStateCallbacks, type Room } from 'colyseus.js';
import { createCharacterTexture, DEFAULT_COLORS, type CharacterColors } from './character';
import type { ChatMessage } from '../lib/colyseus';

const SPEED = 80; // พิกเซลต่อวินาที (ต้องตรงกับเซิร์ฟเวอร์)
const SEND_INTERVAL_MS = 100; // ส่งตำแหน่งให้เซิร์ฟเวอร์ 10 ครั้ง/วินาที
const BUBBLE_MS = 5000;

type Dir = 'down' | 'up' | 'left' | 'right';
type NetPlayer = { name: string; avatar: string; x: number; y: number; dir: Dir; moving: boolean };

// ตัวละครหนึ่งตัวบนจอ (ทั้งของเราและของคนอื่น): ภาพ + ป้ายชื่อ + บับเบิลแชท
class Avatar {
  sprite: Phaser.Physics.Arcade.Sprite;
  private nameTag: Phaser.GameObjects.Text;
  private bubble?: Phaser.GameObjects.Text;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private textureKey: string;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, name: string, colors: CharacterColors) {
    this.scene = scene;
    // ใช้สีเป็นชื่อภาพ คนที่แต่งตัวเหมือนกันจะใช้ภาพร่วมกัน ไม่ต้องวาดซ้ำ
    this.textureKey = 'av-' + Object.values(colors).join('').replace(/#/g, '');
    createCharacterTexture(scene, this.textureKey, colors);
    this.sprite = scene.physics.add.sprite(x, y, this.textureKey, 0);
    this.nameTag = makeLabel(scene, name, '#ffffff').setOrigin(0.5, 1);
  }

  setPose(dir: Dir, moving: boolean) {
    const side = dir === 'left' || dir === 'right';
    this.sprite.setFlipX(dir === 'left');
    const anim = side ? 'side' : dir;
    if (moving) {
      this.sprite.anims.play(`${this.textureKey}-walk-${anim}`, true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame({ down: 0, up: 3, side: 6 }[anim]);
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

  // ให้ป้ายชื่อ/บับเบิลตามตัวละคร และเรียงความลึกตามแกน y (ตัวที่อยู่ล่างกว่าจะทับตัวที่อยู่บน)
  follow() {
    const { x, y } = this.sprite;
    this.sprite.setDepth(5 + y / 10000);
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

// ตัวหนังสือ: ฟอนต์ใหญ่แล้วย่อลง 4 เท่า และใช้การกรองแบบเนียน จะได้คมตอนกล้องซูม
function makeLabel(scene: Phaser.Scene, text: string, color: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  const label = scene.add
    .text(0, 0, text, { fontFamily: 'Itim, sans-serif', fontSize: '24px', color, stroke: '#2b1d26', strokeThickness: 4, ...style })
    .setScale(0.25)
    .setDepth(20);
  label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return label;
}

function parseColors(json: string): CharacterColors {
  try {
    return { ...DEFAULT_COLORS, ...JSON.parse(json) };
  } catch {
    return DEFAULT_COLORS;
  }
}

// ฉากเมือง: แผนที่ Tiled + ตัวเรา (เดิน ชน กล้องตาม) + ผู้เล่นคนอื่นจากเซิร์ฟเวอร์
export class TownScene extends Phaser.Scene {
  private room!: Room;
  private me!: Avatar;
  private others = new Map<string, Avatar>();
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private colors: CharacterColors = DEFAULT_COLORS;
  private playerName = '';
  private dir: Dir = 'down';
  private lastSent = { x: 0, y: 0, dir: 'down', moving: false, at: 0 };
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super('TownScene');
  }

  init(data: { colors?: CharacterColors; name?: string; room: Room }) {
    this.colors = data.colors ?? DEFAULT_COLORS;
    this.playerName = data.name ?? '';
    this.room = data.room;
  }

  preload() {
    this.load.image('tiny-town', 'assets/tiles/tiny-town.png');
    this.load.tilemapTiledJSON('town', 'assets/maps/town.json');
  }

  create() {
    const map = this.make.tilemap({ key: 'town' });
    const tiles = map.addTilesetImage('tiny-town', 'tiny-town')!;
    map.createLayer('ground', tiles)!.setDepth(0);
    const walls = map.createLayer('walls', tiles)!.setDepth(1);
    map.createLayer('above', tiles)!.setDepth(10);
    walls.setCollisionByExclusion([-1]); // ทุกช่องในชั้น walls ชนได้

    const spawn = map.findObject('objects', (o) => o.name === 'spawn');
    this.me = new Avatar(this, spawn?.x ?? 100, spawn?.y ?? 100, this.playerName, this.colors);
    const body = this.me.sprite;
    // ให้ชนเฉพาะช่วงเท้า ตัวละครจะเดินชิดของได้ดูเป็นธรรมชาติ
    body.body!.setSize(10, 5).setOffset(3, 11);
    body.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(body, walls);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setZoom(2);
    cam.startFollow(body, true, 0.15, 0.15);
    cam.roundPixels = true;

    // false = ไม่แย่งปุ่มจากเบราว์เซอร์ จะได้พิมพ์ตัว w a s d ในช่องแชทได้
    const kb = this.input.keyboard!;
    const key = (k: string) => kb.addKey(k, false);
    this.keys = {
      up: key('UP'), down: key('DOWN'), left: key('LEFT'), right: key('RIGHT'),
      w: key('W'), a: key('A'), s: key('S'), d: key('D'),
    };

    this.connectRoom();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribers.forEach((off) => off()));
  }

  private connectRoom() {
    const $ = getStateCallbacks(this.room);
    const players = $(this.room.state).players;

    this.unsubscribers.push(
      players.onAdd((p: NetPlayer, sessionId: string) => {
        if (sessionId === this.room.sessionId) {
          this.me.sprite.setPosition(p.x, p.y); // เซิร์ฟเวอร์เป็นคนเลือกจุดเกิด
          this.lastSent = { ...this.lastSent, x: p.x, y: p.y };
          return;
        }
        const other = new Avatar(this, p.x, p.y, p.name, parseColors(p.avatar));
        other.setPose(p.dir, p.moving);
        this.others.set(sessionId, other);
      }),
      players.onRemove((_p: NetPlayer, sessionId: string) => {
        this.others.get(sessionId)?.destroy();
        this.others.delete(sessionId);
      }),
      this.room.onMessage('chat', (msg: ChatMessage) => {
        if (msg.system || !msg.sessionId) return;
        const who = msg.sessionId === this.room.sessionId ? this.me : this.others.get(msg.sessionId);
        who?.say(msg.text);
      }),
    );
  }

  update(_time: number, delta: number) {
    this.moveMe();
    this.me.follow();
    this.sendPosition();

    // ผู้เล่นคนอื่น: ค่อยๆ เลื่อนไปหาตำแหน่งล่าสุดจากเซิร์ฟเวอร์ (ไม่กระตุกแม้ข้อมูลมา 10 ครั้ง/วินาที)
    const t = Math.min(1, delta / 100);
    for (const [sessionId, other] of this.others) {
      const p = this.room.state.players.get(sessionId) as NetPlayer | undefined;
      if (!p) continue;
      const s = other.sprite;
      s.setPosition(s.x + (p.x - s.x) * t, s.y + (p.y - s.y) * t);
      other.setPose(p.dir, p.moving || Math.hypot(p.x - s.x, p.y - s.y) > 1);
      other.follow();
    }
  }

  private moveMe() {
    const sprite = this.me.sprite;
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '');
    const k = this.keys;
    let dx = 0;
    let dy = 0;
    if (!typing) {
      dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    }

    // มือถือ/เมาส์: กดค้างแล้วเดินไปทางนิ้ว
    const pointer = this.input.activePointer;
    if (dx === 0 && dy === 0 && pointer.isDown) {
      const ox = pointer.worldX - sprite.x;
      const oy = pointer.worldY - sprite.y;
      if (Math.hypot(ox, oy) > 6) {
        dx = ox;
        dy = oy;
      }
    }

    const len = Math.hypot(dx, dy);
    if (len === 0) {
      sprite.setVelocity(0, 0);
      this.me.setPose(this.dir, false);
      return;
    }
    sprite.setVelocity((dx / len) * SPEED, (dy / len) * SPEED);
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy > 0 ? 'down' : 'up';
    this.me.setPose(this.dir, true);
  }

  private sendPosition() {
    const now = this.time.now;
    if (now - this.lastSent.at < SEND_INTERVAL_MS) return;
    const { x, y } = this.me.sprite;
    const moving = (this.me.sprite.body as Phaser.Physics.Arcade.Body).speed > 0;
    const last = this.lastSent;
    if (Math.abs(x - last.x) < 0.5 && Math.abs(y - last.y) < 0.5 && this.dir === last.dir && moving === last.moving) return;
    const msg = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, dir: this.dir, moving };
    this.room.send('move', msg);
    this.lastSent = { ...msg, at: now };
  }
}
