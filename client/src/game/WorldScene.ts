import Phaser from 'phaser';
import { getStateCallbacks, type Room } from 'colyseus.js';
import { preloadCharacters } from './character';
import { Avatar, type Dir } from './avatar';
import { parseAvatar } from '../lib/characters';
import type { ChatMessage } from '../lib/colyseus';
import type { HomeData } from '../lib/home';

const SPEED = 80; // พิกเซลต่อวินาที (ต้องตรงกับเซิร์ฟเวอร์)
const SEND_INTERVAL_MS = 100; // ส่งตำแหน่งให้เซิร์ฟเวอร์ 10 ครั้ง/วินาที

type NetPlayer = { userId: string; name: string; avatar: string; x: number; y: number; dir: Dir; moving: boolean; focusing: boolean };

// ข้อมูลที่ React ส่งให้ฉากตอนเริ่ม
// bridge = ช่องทางคุยกันระหว่างเกมกับ React เช่น เกมบอก "กดตัวละครคนนี้" แล้ว React เปิดการ์ดโปรไฟล์
export type WorldInit = {
  character: string;
  name: string;
  room: Room;
  bridge: Phaser.Events.EventEmitter;
  home?: HomeData;
};

export type WorldSetup = {
  width: number;
  height: number;
  colliders: Phaser.Types.Physics.Arcade.ArcadeColliderType[];
  zoom: number;
  followCamera: boolean;
};

// ฉากพื้นฐาน: ตัวเรา (เดิน ชน) + ผู้เล่นคนอื่นจากเซิร์ฟเวอร์ + บับเบิลแชท
// ฉากเมืองและฉากบ้านสร้างต่อจากคลาสนี้ แล้วเขียนแค่ส่วน buildWorld (หน้าตาแผนที่)
export abstract class WorldScene extends Phaser.Scene {
  protected room!: Room;
  protected bridge!: Phaser.Events.EventEmitter;
  protected me!: Avatar;
  protected dir: Dir = 'down';
  protected pointerWalk = true; // ปิดตอนแต่งห้อง เพราะใช้เมาส์วางของแทน
  protected inputLocked = false; // เปิดหน้าต่างเกมอยู่ (ปุ่มลูกศรใช้บังคับงูแทน ตัวละครต้องไม่เดิน)
  protected initData!: WorldInit;
  private others = new Map<string, Avatar>();
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private lastSent = { x: 0, y: 0, dir: 'down', moving: false, at: 0 };
  private unsubscribers: (() => void)[] = [];

  init(data: WorldInit) {
    this.initData = data;
    this.room = data.room;
    this.bridge = data.bridge;
  }

  protected abstract buildWorld(): WorldSetup;

  // ฉากลูกเรียก super.preload() แล้วโหลดของตัวเองต่อ
  preload() {
    preloadCharacters(this);
  }
  protected afterUpdate(): void {}

  create() {
    const setup = this.buildWorld();
    const { character, name } = this.initData;

    this.me = new Avatar(this, setup.width / 2, setup.height / 2, name, character);
    const sprite = this.me.sprite;
    // ให้ชนเฉพาะช่วงเท้า ตัวละครจะเดินชิดของได้ดูเป็นธรรมชาติ
    sprite.body!.setSize(10, 5).setOffset(3, 11);
    sprite.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, setup.width, setup.height);
    for (const c of setup.colliders) this.physics.add.collider(sprite, c);

    const cam = this.cameras.main;
    cam.setZoom(setup.zoom);
    cam.roundPixels = true;
    if (setup.followCamera) {
      cam.setBounds(0, 0, setup.width, setup.height);
      cam.startFollow(sprite, true, 0.15, 0.15);
    } else {
      cam.centerOn(setup.width / 2, setup.height / 2);
    }

    // false = ไม่แย่งปุ่มจากเบราว์เซอร์ จะได้พิมพ์ตัว w a s d ในช่องแชทได้
    const kb = this.input.keyboard!;
    const key = (k: string) => kb.addKey(k, false);
    this.keys = {
      up: key('UP'), down: key('DOWN'), left: key('LEFT'), right: key('RIGHT'),
      w: key('W'), a: key('A'), s: key('S'), d: key('D'),
    };

    this.connectRoom();
    this.listen('input-lock', (locked: boolean) => {
      this.inputLocked = locked;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribers.forEach((off) => off()));
  }

  // ลงทะเบียนตัวฟังเหตุการณ์จาก React แล้วยกเลิกให้อัตโนมัติตอนปิดฉาก
  protected listen(event: string, fn: (...args: never[]) => void) {
    this.bridge.on(event, fn);
    this.unsubscribers.push(() => this.bridge.off(event, fn));
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
        const other = new Avatar(this, p.x, p.y, p.name, parseAvatar(p.avatar).character);
        other.setPose(p.dir, p.moving);
        // กดที่ตัวละครคนอื่น → React เปิดการ์ด (ไปส่องบ้านได้)
        other.sprite.setInteractive({ useHandCursor: true });
        other.sprite.on('pointerdown', () => this.bridge.emit('player-click', { userId: p.userId, name: p.name }));
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
    const mine = this.room.state.players.get(this.room.sessionId) as NetPlayer | undefined;
    this.me.setFocusing(mine?.focusing ?? false);
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
      other.setFocusing(p.focusing);
      other.follow();
    }

    this.afterUpdate();
  }

  // กำลังพิมพ์ในช่องแชท/ฟอร์ม หรือเปิดหน้าต่างเกมอยู่ = ปุ่มคีย์บอร์ดไม่ใช่ของตัวละคร
  protected isTyping() {
    return this.inputLocked || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
  }

  private moveMe() {
    const sprite = this.me.sprite;
    const typing = this.isTyping();
    const k = this.keys;
    let dx = 0;
    let dy = 0;
    if (!typing) {
      dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    }

    // มือถือ/เมาส์: กดค้างแล้วเดินไปทางนิ้ว
    const pointer = this.input.activePointer;
    if (this.pointerWalk && !this.inputLocked && dx === 0 && dy === 0 && pointer.isDown) {
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
