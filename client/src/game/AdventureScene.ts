import Phaser from 'phaser';
import { preloadCharacters } from './character';
import { Avatar, depthAt, makeLabel, type Dir } from './avatar';
import { addMoveKeys, dirOf, readMove, typingInForm, type MoveKeys } from './controls';
import { MAP_H, MAP_SETS, MAP_W, makeStageMap } from '../lib/adventureMap';
import { foeOf, monsterUrl, type Foe, type Stage } from '../lib/adventureStages';
import type { Level } from '../lib/adventure';
import { DIR_COLUMN } from '../lib/characters';

const SPEED = 80; // เท่ากับในเมือง
const MON_SPEED = 22;
const BOSS_FRAME = 50; // ภาพบอส: เฟรมละ 50x50 เรียงแนวนอน 5 เฟรม
const RETRY_MS = 2000; // ถอยออกมาแล้ว มอนตัวนั้นจะยังไม่ชวนสู้อีกช่วงหนึ่ง

// ข้อมูลที่ React ส่งให้ฉากตอนเริ่ม (ด่านผจญภัยเล่นคนเดียว ไม่ต่อเซิร์ฟเวอร์เกม ตัวละครเดินในเครื่องเราเอง)
export type AdventureInit = {
  character: string;
  name: string;
  bridge: Phaser.Events.EventEmitter;
  stage: Stage;
  level: Level;
  monsters: number[]; // เลือดของมอนแต่ละตัวตอนเริ่มด่าน
};

type Mon = {
  i: number;
  foe: Foe;
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  bar?: Phaser.GameObjects.Graphics;
  home: { x: number; y: number };
  hp: number;
  maxHp: number;
  dir: Dir;
  nextTurn: number;
  calmUntil: number;
};

// ฉากด่าน: เดินไปชนมอน → บอก React ให้เปิดหน้าต่างตอบโจทย์ / React บอกผลกลับมาว่ามอนเสียเลือดหรือเราโดนตี
export class AdventureScene extends Phaser.Scene {
  private data0!: AdventureInit;
  private bridge!: Phaser.Events.EventEmitter;
  private me!: Avatar;
  private dir: Dir = 'right';
  private keys!: MoveKeys;
  private mons: Mon[] = [];
  private fighting = false; // เปิดหน้าต่างตอบโจทย์อยู่ = ทุกตัวหยุดเดิน
  private offs: (() => void)[] = [];

  constructor() {
    super('AdventureScene');
  }

  init(data: AdventureInit) {
    this.data0 = data;
    this.bridge = data.bridge;
  }

  preload() {
    preloadCharacters(this);
    for (const s of MAP_SETS) this.load.image(`adv-${s.name}`, `assets/tiles/ninja/${s.file}`);
    const { stage, level, monsters } = this.data0;
    monsters.forEach((hp, i) => {
      const foe = foeOf(stage, level, i, monsters.length, hp);
      const key = `mon-${foe.key}`;
      if (this.textures.exists(key)) return;
      const size = foe.boss ? BOSS_FRAME : 16;
      this.load.spritesheet(key, monsterUrl(foe.key), { frameWidth: size, frameHeight: size });
    });
  }

  create() {
    const { stage, level, monsters, character, name } = this.data0;
    const plan = makeStageMap(stage, monsters.length, stage.n === 10);

    // แผนที่: สร้างจากข้อมูลที่สุ่มไว้ (ใช้หลายชุดภาพในชั้นเดียวกัน)
    const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: MAP_W, height: MAP_H });
    const sets = MAP_SETS.map((s) => map.addTilesetImage(s.name, `adv-${s.name}`, 16, 16, 0, 0, s.firstgid)!);
    const layer = (key: string, data: number[], depth: number) => {
      const l = map.createBlankLayer(key, sets)!.setDepth(depth);
      data.forEach((g, i) => g && l.putTileAt(g, i % MAP_W, Math.floor(i / MAP_W)));
      return l;
    };
    layer('ground', plan.ground, 0);
    layer('deco', plan.deco, 0.5);
    layer('walls', plan.walls, 1);
    layer('above', plan.above, 10);
    const block = layer('block', plan.solid.map((s) => (s ? 1 : 0)), 0).setVisible(false);
    block.setCollisionByExclusion([-1]);
    const W = MAP_W * 16;
    const H = MAP_H * 16;
    // ถ้ำ/รังบอส: ย้อมพื้นให้มืดลง (ใต้ตัวละคร ตัวละครจะได้ยังเห็นชัด)
    if (stage.tint) this.add.rectangle(0, 0, W, H, stage.tint).setOrigin(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(1.5);

    // ตัวเรา
    const start = plan.start;
    this.me = new Avatar(this, start.x * 16 + 8, start.y * 16 + 8, name, character);
    const sprite = this.me.sprite;
    sprite.body!.setSize(10, 5).setOffset(3, 11);
    sprite.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, W, H);
    this.physics.add.collider(sprite, block);
    this.me.setPose('right', false);

    // มอนสเตอร์
    monsters.forEach((hp, i) => {
      const foe = foeOf(stage, level, i, monsters.length, hp);
      const spot = plan.spots[i];
      const x = spot.x * 16 + 8;
      const y = spot.y * 16 + 8;
      const key = `mon-${foe.key}`;
      const s = this.physics.add.sprite(x, y, key, 0);
      if (foe.boss) {
        if (!this.anims.exists(`${key}-idle`)) {
          this.anims.create({ key: `${key}-idle`, frames: this.anims.generateFrameNumbers(key, { start: 0, end: 4 }), frameRate: 6, repeat: -1 });
        }
        s.anims.play(`${key}-idle`);
        s.body!.setSize(30, 24).setOffset(10, 22);
        s.setImmovable(true);
      } else {
        for (const [d, col] of Object.entries(DIR_COLUMN)) {
          const k = `${key}-walk-${d}`;
          if (!this.anims.exists(k)) this.anims.create({ key: k, frames: [0, 1, 2, 3].map((r) => ({ key, frame: r * 4 + col })), frameRate: 6, repeat: -1 });
        }
        if (foe.elite) s.setScale(1.5);
        s.body!.setSize(12, 10).setOffset(2, 5);
        this.physics.add.collider(s, block);
      }
      s.setCollideWorldBounds(true);
      // มือถือจอเล็ก เกมถูกย่อ จึงขยายชื่อให้อ่านออก (แบบป้ายในเมือง)
      const size = this.sys.game.device.input.touch ? '36px' : '24px';
      const label = makeLabel(this, foe.name, foe.boss ? '#ff8a8a' : foe.elite ? '#ffcf5c' : '#ffffff', { fontSize: size }).setOrigin(0.5, 1);
      const mon: Mon = { i, foe, sprite: s, label, home: { x, y }, hp, maxHp: hp, dir: 'down', nextTurn: 0, calmUntil: 0 };
      if (hp > 1) mon.bar = this.add.graphics().setDepth(20);
      this.mons.push(mon);
      this.physics.add.overlap(sprite, s, () => this.touch(mon));
    });

    const cam = this.cameras.main;
    cam.setZoom(2);
    cam.roundPixels = true;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(sprite, true, 0.15, 0.15);
    this.keys = addMoveKeys(this);

    // ป้ายชื่อด่านลอยขึ้นตอนเริ่ม
    const title = makeLabel(this, `${stage.emoji} ด่าน ${stage.n}: ${stage.name}`, '#fff3c4', { fontSize: '40px', strokeThickness: 6 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setPosition(cam.width / 2, cam.height / 2 - 60);
    this.tweens.add({ targets: title, alpha: 0, delay: 1800, duration: 700, onComplete: () => title.destroy() });

    this.listen('monster-hp', ({ index, hp }: { index: number; hp: number }) => this.setHp(index, hp));
    this.listen('battle-end', ({ index }: { index: number }) => this.endBattle(index));
    this.listen('player-hit', () => {
      this.me.sprite.setTint(0xff6b6b);
      this.cameras.main.shake(180, 0.006);
      this.time.delayedCall(300, () => this.me.sprite.clearTint());
    });
    // ปิดเกมทั้งเกม (game.destroy) ได้ DESTROY ไม่ใช่ SHUTDOWN จึงต้องฟังทั้งสองอย่าง
    const cleanup = () => {
      this.offs.forEach((off) => off());
      this.offs = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  private listen(event: string, fn: (...args: never[]) => void) {
    this.bridge.on(event, fn);
    this.offs.push(() => this.bridge.off(event, fn));
  }

  // เดินชนมอน → เริ่มสู้ (React จะขอโจทย์จากฐานข้อมูล)
  private touch(mon: Mon) {
    if (this.fighting || mon.hp <= 0 || this.time.now < mon.calmUntil) return;
    this.fighting = true;
    this.me.sprite.setVelocity(0, 0);
    this.me.setPose(this.dir, false);
    for (const m of this.mons) m.sprite.setVelocity(0, 0);
    // มอนหันมาหาเรา
    const dx = this.me.sprite.x - mon.sprite.x;
    const dy = this.me.sprite.y - mon.sprite.y;
    if (!mon.foe.boss) {
      mon.dir = dirOf(dx, dy);
      mon.sprite.anims.stop();
      mon.sprite.setFrame(DIR_COLUMN[mon.dir]);
    }
    this.bridge.emit('battle', mon.i);
  }

  // ปิดหน้าต่างตอบโจทย์ (ชนะ/ถอย): ถอยตัวเราออกมานิดหนึ่ง จะได้ไม่ชนซ้ำทันที
  private endBattle(index: number) {
    this.fighting = false;
    const mon = this.mons[index];
    if (!mon) return;
    mon.calmUntil = this.time.now + RETRY_MS;
    if (mon.hp > 0) {
      const s = this.me.sprite;
      const a = Math.atan2(s.y - mon.sprite.y, s.x - mon.sprite.x);
      s.setPosition(s.x + Math.cos(a) * 14, s.y + Math.sin(a) * 14);
    }
  }

  private setHp(index: number, hp: number) {
    const mon = this.mons[index];
    if (!mon) return;
    const hit = hp < mon.hp;
    mon.hp = hp;
    if (hit) {
      // โดนโจมตี: กะพริบขาว + สั่น
      mon.sprite.setTintFill(0xffffff);
      this.time.delayedCall(120, () => mon.sprite.clearTint());
      this.tweens.add({ targets: mon.sprite, x: mon.sprite.x + 3, duration: 50, yoyo: true, repeat: 2 });
    }
    if (hp <= 0) {
      mon.label.destroy();
      mon.bar?.destroy();
      mon.sprite.disableBody(false, false);
      this.tweens.add({
        targets: mon.sprite,
        alpha: 0,
        scale: mon.sprite.scale * 1.6,
        angle: 90,
        delay: 250,
        duration: 450,
        onComplete: () => mon.sprite.destroy(),
      });
      const poof = makeLabel(this, '💥', '#ffffff', { fontSize: '48px' }).setOrigin(0.5).setPosition(mon.sprite.x, mon.sprite.y);
      this.tweens.add({ targets: poof, alpha: 0, y: poof.y - 12, delay: 200, duration: 600, onComplete: () => poof.destroy() });
    }
  }

  update() {
    this.moveMe();
    this.me.follow();
    for (const m of this.mons) if (m.hp > 0) this.moveMon(m);
  }

  private moveMe() {
    const sprite = this.me.sprite;
    const locked = this.fighting;
    const { dx, dy } = locked ? { dx: 0, dy: 0 } : readMove(this, this.keys, sprite, !typingInForm(), true);
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      sprite.setVelocity(0, 0);
      this.me.setPose(this.dir, false);
      return;
    }
    sprite.setVelocity((dx / len) * SPEED, (dy / len) * SPEED);
    this.dir = dirOf(dx, dy);
    this.me.setPose(this.dir, true);
  }

  // มอนเดินเล่นแถวที่ของตัวเอง (บอสยืนเฉยๆ)
  private moveMon(m: Mon) {
    const s = m.sprite;
    const scale = m.foe.elite ? 1.5 : 1;
    const top = s.y - (m.foe.boss ? 22 : 8 * scale);
    m.label.setPosition(s.x, top - (m.bar ? 4 : 1));
    s.setDepth(depthAt(s.y + (m.foe.boss ? 22 : 8 * scale)));
    if (m.bar) {
      m.bar.clear();
      const w = m.foe.boss ? 30 : 16;
      m.bar.fillStyle(0x120d1a).fillRect(s.x - w / 2 - 1, top - 4, w + 2, 4);
      m.bar.fillStyle(0xe04f5f).fillRect(s.x - w / 2, top - 3, (w * m.hp) / m.maxHp, 2);
    }
    if (m.foe.boss || this.fighting) return;

    const now = this.time.now;
    if (now >= m.nextTurn) {
      m.nextTurn = now + 900 + Math.random() * 1600;
      const away = Phaser.Math.Distance.Between(s.x, s.y, m.home.x, m.home.y);
      if (away > 40) {
        // ไกลบ้านเกินไป เดินกลับ
        const a = Math.atan2(m.home.y - s.y, m.home.x - s.x);
        s.setVelocity(Math.cos(a) * MON_SPEED, Math.sin(a) * MON_SPEED);
      } else if (Math.random() < 0.35) {
        s.setVelocity(0, 0);
      } else {
        const a = Math.random() * Math.PI * 2;
        s.setVelocity(Math.cos(a) * MON_SPEED, Math.sin(a) * MON_SPEED);
      }
    }
    const body = s.body as Phaser.Physics.Arcade.Body;
    if (body.speed > 1) {
      m.dir = dirOf(body.velocity.x, body.velocity.y);
      s.anims.play(`mon-${m.foe.key}-walk-${m.dir}`, true);
    } else {
      s.anims.stop();
      s.setFrame(DIR_COLUMN[m.dir]);
    }
  }
}
