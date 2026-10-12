import Phaser from 'phaser';
import { preloadCharacters } from './character';
import { Avatar, depthAt, makeLabel, type Dir } from './avatar';
import { addMoveKeys, dirOf, typingInForm, type MoveKeys } from './controls';
import { MAP_SETS } from '../lib/adventureMap';
import { monsterUrl } from '../lib/adventureStages';
import { DIR_COLUMN } from '../lib/characters';
import {
  ARENA_H, ARENA_W, BOSS, ENEMIES, MAX_ENEMIES, RUN_SECONDS, UPGRADES, makeArenaMap, noLevels, openUpgrades, pickEnemy,
  spawnPerSecond, statsOf, xpToNext, type EnemyType, type Levels, type Stats, type UpgradeId,
} from '../lib/survivor';
import {
  BASE_SKILLS, ELEMENTS, FUSE_LEVEL, MAX_SKILL_LEVEL, MAX_SKILLS, SKILL_BY_ID, describeSkill, fusionOf, specialOf,
  type Element, type SkillDef,
} from '../lib/skills';
import { SkillEngine, createSkillAnims, preloadSkillFx, type SkillHost } from './skillEngine';

const W = ARENA_W * 16;
const H = ARENA_H * 16;
const BULLET_SPEED = 230;
const BULLET_LIFE = 1100; // มิลลิวินาที
const HURT_MS = 600; // โดนตีแล้วอมตะชั่วครู่
const ULT_KILLS = 80; // ล้มมอนครบเท่านี้ = เกจท่าไม้ตายเต็ม (หัวหน้านับ 10)
const HUD_MS = 150;

export type SurvivorInit = { character: string; name: string; bridge: Phaser.Events.EventEmitter };
export type HudSkill = { id: string; name: string; emoji: string; level: number; fused: boolean };
export type Hud = {
  hp: number; maxHp: number; xp: number; need: number; level: number; sec: number; kills: number; coins: number; boss?: number;
  skills: HudSkill[]; ult: number; ultName: string;
};
// ตัวเลือกตอนเลเวลอัป: อัปค่าตัว / สกิลใหม่หรืออัปสกิล / ผสม 2 สกิล / ฟื้นเลือด
export type LevelUpChoice =
  | { kind: 'stat'; id: UpgradeId; name: string; emoji: string; desc: string; next: number }
  | { kind: 'skill'; id: string; name: string; emoji: string; desc: string; next: number; fused: boolean }
  | { kind: 'fuse'; id: string; a: string; b: string; name: string; emoji: string; desc: string; next: number }
  | { kind: 'heal'; name: string; emoji: string; desc: string };
export type RunResult = { won: boolean; sec: number; kills: number; level: number; coins: number };

class Enemy extends Phaser.Physics.Arcade.Sprite {
  kind!: EnemyType;
  hp = 0;
  maxHp = 0;
  speed = 0;
  damage = 0;
  elite = false;
  boss = false;
  dir: Dir = 'down';
  flashUntil = 0;
  // สถานะจากธาตุ (มิลลิวินาทีของเกม)
  burnUntil = 0;
  burnDps = 0;
  poisonUntil = 0;
  poisonDps = 0;
  slowUntil = 0;
  stunUntil = 0;
  dot = 0;
  statusTint = 0;
}

type Bullet = Phaser.Physics.Arcade.Image & { bornAt: number; pierceLeft: number; hits: Set<Enemy> };
type Drop = { img: Phaser.GameObjects.Image; kind: 'gem' | 'gem5' | 'coin' | 'heart'; flying: boolean };

// สนามรบ: เดินหลบฝูงมอน ตัวละครปาดาวกระจายเอง เก็บคริสตัลเพื่อเลเวลอัป แล้วเลือกพลังใหม่
// เล่นคนเดียวในเครื่อง ฉากบอก React ผ่าน bridge: hud / levelup / end   React สั่งกลับ: pick / pause
export class SurvivorScene extends Phaser.Scene {
  private init0!: SurvivorInit;
  private bridge!: Phaser.Events.EventEmitter;
  private me!: Avatar;
  private dir: Dir = 'down';
  private keys!: MoveKeys;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private drops: Drop[] = [];
  private skills!: SkillEngine<Enemy>;
  private special = specialOf('Boy');
  private ult = 0; // 0-100
  private keySpace!: Phaser.Input.Keyboard.Key;
  private levels: Levels = noLevels();
  private stats: Stats = statsOf(noLevels());
  private hp = 100;
  private xp = 0;
  private level = 1;
  private kills = 0;
  private coins = 0;
  private elapsed = 0; // มิลลิวินาทีที่เล่นจริง (ไม่นับตอนหยุด)
  private paused = false; // หน้าต่างเลือกพลัง / เมนูหยุด
  private menuPaused = false;
  private over = false;
  private pendingLevels = 0;
  private hurtUntil = 0;
  private nextShot = 0;
  private spawnDebt = 0;
  private nextElite = 60_000;
  private bossSpawned = false;
  private bossRef?: Enemy;
  private lastHud = 0;
  private regenDebt = 0;
  private healDebt = 0;
  private lastDt = 16;
  private touch = false;
  private stick?: { ox: number; oy: number; g: Phaser.GameObjects.Graphics };
  private lastMouseMove = -99999;
  private offs: (() => void)[] = [];

  constructor() {
    super('SurvivorScene');
  }

  init(data: SurvivorInit) {
    this.init0 = data;
    this.bridge = data.bridge;
  }

  preload() {
    preloadCharacters(this);
    for (const s of MAP_SETS) this.load.image(`adv-${s.name}`, `assets/tiles/ninja/${s.file}`);
    for (const e of ENEMIES) this.load.spritesheet(`mon-${e.key}`, monsterUrl(e.key), { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet(`mon-${BOSS.key}`, monsterUrl(BOSS.key), { frameWidth: 50, frameHeight: 50 });
    this.load.spritesheet('fx-shuriken', 'assets/fx/shuriken.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('fx-thunder', 'assets/fx/thunder.png', { frameWidth: 20, frameHeight: 28 });
    this.load.spritesheet('fx-smoke', 'assets/fx/smoke.png', { frameWidth: 32, frameHeight: 32 });
    this.load.image('fx-gem', 'assets/fx/gem-green.png');
    this.load.image('fx-gem5', 'assets/fx/gem-purple.png');
    this.load.image('fx-coin', 'assets/fx/coin.png');
    this.load.image('fx-heart', 'assets/fx/heart.png');
    preloadSkillFx(this);
  }

  create() {
    this.touch = this.sys.game.device.input.touch;

    // แผนที่
    const plan = makeArenaMap();
    const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: ARENA_W, height: ARENA_H });
    const sets = MAP_SETS.map((s) => map.addTilesetImage(s.name, `adv-${s.name}`, 16, 16, 0, 0, s.firstgid)!);
    const layer = (key: string, data: number[], depth: number) => {
      const l = map.createBlankLayer(key, sets)!.setDepth(depth);
      data.forEach((g, i) => g && l.putTileAt(g, i % ARENA_W, Math.floor(i / ARENA_W)));
      return l;
    };
    layer('ground', plan.ground, 0);
    layer('deco', plan.deco, 0.5);
    layer('walls', plan.walls, 1);
    layer('above', plan.above, 10);
    const block = layer('block', plan.solid.map((s) => (s ? 1 : 0)), 0).setVisible(false);
    block.setCollisionByExclusion([-1]);

    // ตัวเรา
    const { character, name } = this.init0;
    this.me = new Avatar(this, W / 2, H / 2, name, character);
    const sprite = this.me.sprite;
    sprite.body!.setSize(10, 8).setOffset(3, 8);
    sprite.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, W, H);
    this.physics.add.collider(sprite, block);

    // ท่าทางมอน
    for (const e of ENEMIES) {
      const key = `mon-${e.key}`;
      for (const [d, col] of Object.entries(DIR_COLUMN)) {
        const k = `${key}-walk-${d}`;
        if (!this.anims.exists(k)) this.anims.create({ key: k, frames: [0, 1, 2, 3].map((r) => ({ key, frame: r * 4 + col })), frameRate: 6, repeat: -1 });
      }
    }
    const bossKey = `mon-${BOSS.key}`;
    if (!this.anims.exists(`${bossKey}-idle`)) {
      this.anims.create({ key: `${bossKey}-idle`, frames: this.anims.generateFrameNumbers(bossKey, { start: 0, end: 4 }), frameRate: 6, repeat: -1 });
    }
    if (!this.anims.exists('fx-thunder')) this.anims.create({ key: 'fx-thunder', frames: this.anims.generateFrameNumbers('fx-thunder', {}), frameRate: 20 });
    if (!this.anims.exists('fx-smoke')) this.anims.create({ key: 'fx-smoke', frames: this.anims.generateFrameNumbers('fx-smoke', {}), frameRate: 18 });

    this.enemies = this.physics.add.group({ classType: Enemy, maxSize: MAX_ENEMIES + 5 });
    this.bullets = this.physics.add.group({ maxSize: 120 });
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.bulletHit(b as unknown as Bullet, e as unknown as Enemy));
    this.physics.add.overlap(sprite, this.enemies, (_p, e) => this.touchEnemy(e as unknown as Enemy));

    const cam = this.cameras.main;
    cam.setZoom(2);
    cam.roundPixels = true;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(sprite, true, 0.15, 0.15);
    this.keys = addMoveKeys(this);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.lastMouseMove = this.elapsed;
    });

    // มือถือ: จอยสติ๊กลอย (แตะตรงไหนก็ได้ ลากเพื่อเดิน)
    if (this.touch) {
      const g = this.add.graphics().setDepth(30);
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.stick = { ox: p.x, oy: p.y, g }));
      this.input.on('pointerup', () => {
        g.clear();
        this.stick = undefined;
      });
    }

    // สกิล: ตัวละครแต่ละตัวเริ่มด้วยสกิลประจำตัว + มีท่าไม้ตายของตัวเอง
    createSkillAnims(this);
    this.special = specialOf(character);
    this.skills = new SkillEngine<Enemy>(this.skillHost());
    const start = SKILL_BY_ID.get(this.special.start);
    if (start) this.skills.add(start);
    this.keySpace = this.input.keyboard!.addKey('SPACE', false);
    this.listen('ult', () => this.useUlt());

    this.listen('pick', (c: LevelUpChoice) => this.applyPick(c));
    this.listen('pause', (on: boolean) => {
      this.menuPaused = on;
      this.setPaused(on || this.pendingLevels > 0);
    });
    const cleanup = () => {
      this.offs.forEach((off) => off());
      this.offs = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    this.hp = this.stats.maxHp;
    this.emitHud(true);
  }

  private listen(event: string, fn: (...args: never[]) => void) {
    this.bridge.on(event, fn);
    this.offs.push(() => this.bridge.off(event, fn));
  }

  private setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    if (on) {
      this.physics.pause();
      this.anims.pauseAll();
      this.tweens.pauseAll();
      this.time.paused = true;
    } else {
      this.physics.resume();
      this.anims.resumeAll();
      this.tweens.resumeAll();
      this.time.paused = false;
    }
  }

  update(_t: number, delta: number) {
    if (this.paused || this.over) return;
    const dt = Math.min(delta, 50); // แท็บกระตุก/สลับแอป ไม่ให้กระโดดไกล
    this.lastDt = dt;
    this.elapsed += dt;
    const now = this.elapsed;

    this.moveMe();
    this.me.follow();
    if (now < this.hurtUntil) this.me.sprite.setAlpha(Math.floor(now / 80) % 2 ? 0.4 : 1);
    else this.me.sprite.setAlpha(1);

    this.spawn(dt);
    this.moveEnemies(now);
    this.shoot(now);
    this.updateBullets(now);
    this.skills.update(dt);
    if (Phaser.Input.Keyboard.JustDown(this.keySpace) && !typingInForm()) this.useUlt();
    this.updateDrops(dt);

    if (this.stats.regen > 0 && this.hp < this.stats.maxHp) {
      this.regenDebt += (this.stats.regen * dt) / 1000;
      if (this.regenDebt >= 1) {
        this.hp = Math.min(this.stats.maxHp, this.hp + Math.floor(this.regenDebt));
        this.regenDebt %= 1;
      }
    }
    this.emitHud();
  }

  // ---------- การเดิน ----------
  private moveMe() {
    const s = this.me.sprite;
    let dx = 0;
    let dy = 0;
    if (!typingInForm()) {
      const k = this.keys;
      dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    }
    const p = this.input.activePointer;
    // ปล่อยนิ้วตอนหน้าต่างเลือกพลังเปิดอยู่ (เกมไม่ได้รับ pointerup) = เก็บจอยออก
    if (this.stick && !p.isDown) {
      this.stick.g.clear();
      this.stick = undefined;
    }
    if (this.stick && p.isDown) {
      const ox = p.x - this.stick.ox;
      const oy = p.y - this.stick.oy;
      const len = Math.hypot(ox, oy);
      if (len > 8) {
        dx = ox;
        dy = oy;
      }
      // วาดจอยในพิกัดโลก (กล้องซูม 2 เท่า จึงหารครึ่ง)
      const cam = this.cameras.main;
      const base = cam.getWorldPoint(this.stick.ox, this.stick.oy);
      const k = Math.min(len, 40) / (len || 1);
      const knob = cam.getWorldPoint(this.stick.ox + ox * k, this.stick.oy + oy * k);
      this.stick.g.clear().fillStyle(0xffffff, 0.15).fillCircle(base.x, base.y, 20).fillStyle(0xffffff, 0.45).fillCircle(knob.x, knob.y, 8);
    }
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      s.setVelocity(0, 0);
      this.me.setPose(this.dir, false);
      return;
    }
    s.setVelocity((dx / len) * this.stats.speed, (dy / len) * this.stats.speed);
    this.dir = dirOf(dx, dy);
    this.me.setPose(this.dir, true);
  }

  // ---------- มอน ----------
  private spawn(dt: number) {
    const sec = this.elapsed / 1000;
    if (sec >= RUN_SECONDS && !this.bossSpawned) {
      this.bossSpawned = true;
      this.bossRef = this.spawnEnemy(ENEMIES[0], { boss: true });
      this.bridge.emit('toast', `👹 ${BOSS.name} ปรากฏตัวแล้ว! ล้มให้ได้เพื่อชนะ`);
    }
    if (this.elapsed >= this.nextElite) {
      this.nextElite += 60_000;
      this.spawnEnemy(pickEnemy(sec), { elite: true });
    }
    this.spawnDebt += (spawnPerSecond(sec) * dt) / 1000 * (this.bossSpawned ? 0.4 : 1);
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      if (this.enemies.countActive() >= MAX_ENEMIES) break;
      this.spawnEnemy(pickEnemy(sec));
    }
  }

  // เกิดรอบนอกจอ (ถ้าเลยขอบแผนที่ ลองมุมใหม่)
  private spawnEnemy(type: EnemyType, opt: { elite?: boolean; boss?: boolean } = {}) {
    const { x: px, y: py } = this.me.sprite;
    let x = px;
    let y = py;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      x = px + Math.cos(a) * 260;
      y = py + Math.sin(a) * 260;
      if (x > 40 && y > 40 && x < W - 40 && y < H - 40) break;
    }
    x = Phaser.Math.Clamp(x, 40, W - 40);
    y = Phaser.Math.Clamp(y, 40, H - 40);
    const key = opt.boss ? `mon-${BOSS.key}` : `mon-${type.key}`;
    const e = this.enemies.get(x, y, key) as Enemy | null;
    if (!e) return undefined;
    e.enableBody(true, x, y, true, true);
    e.setTexture(key, 0).setAlpha(1).clearTint().setScale(1).setAngle(0);
    const grow = 1 + this.elapsed / 1000 / 240;
    e.kind = type;
    e.elite = !!opt.elite;
    e.boss = !!opt.boss;
    e.hp = e.maxHp = opt.boss ? BOSS.hp : Math.round(type.hp * grow * (opt.elite ? 10 : 1));
    e.speed = opt.boss ? BOSS.speed : type.speed * (opt.elite ? 0.85 : 1);
    e.damage = opt.boss ? BOSS.damage : type.damage * (opt.elite ? 1.5 : 1);
    e.flashUntil = 0;
    e.burnUntil = e.poisonUntil = e.slowUntil = e.stunUntil = 0;
    e.burnDps = e.poisonDps = e.dot = e.statusTint = 0;
    if (opt.boss) {
      e.anims.play(`${key}-idle`);
      e.body!.setSize(30, 26).setOffset(10, 20);
    } else {
      e.anims.play(`${key}-walk-down`);
      e.setScale(opt.elite ? 1.7 : 1);
      e.body!.setSize(12, 12).setOffset(2, 3);
    }
    return e;
  }

  private moveEnemies(now: number) {
    const { x: px, y: py } = this.me.sprite;
    // ดันมอนที่ซ้อนกันออกจากกันเล็กน้อย (แบ่งช่องตาราง 16px จะได้ไม่ต้องเทียบทุกคู่)
    const grid = new Map<number, Enemy[]>();
    const list = this.enemies.getChildren() as unknown as Enemy[];
    for (const e of list) {
      if (!e.active) continue;
      const k = ((e.x >> 4) << 12) | (e.y >> 4);
      const cell = grid.get(k);
      if (cell) cell.push(e);
      else grid.set(k, [e]);
    }
    for (const e of list) {
      if (!e.active) continue;
      const ax = px - e.x;
      const ay = py - e.y;
      const d = Math.hypot(ax, ay) || 1;
      const speed = now < e.stunUntil ? 0 : now < e.slowUntil ? e.speed * 0.5 : e.speed;
      let vx = (ax / d) * speed;
      let vy = (ay / d) * speed;
      const cx = e.x >> 4;
      const cy = e.y >> 4;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const cell = grid.get(((cx + i) << 12) | (cy + j));
          if (!cell) continue;
          for (const o of cell) {
            if (o === e) continue;
            const sx = e.x - o.x;
            const sy = e.y - o.y;
            const sd = sx * sx + sy * sy;
            if (sd > 0 && sd < 144) {
              const f = 30 / Math.sqrt(sd);
              vx += sx * f;
              vy += sy * f;
            }
          }
        }
      }
      e.setVelocity(vx, vy);
      if (!e.boss) {
        const dir = dirOf(ax, ay);
        if (dir !== e.dir) {
          e.dir = dir;
          e.anims.play(`mon-${e.kind.key}-walk-${dir}`, true);
        }
      }
      e.setDepth(depthAt(e.y + 8));
      this.updateStatus(e, now);
      if (!e.active) continue;
      // ไกลเกินไป (ผู้เล่นวิ่งหนี) = ย้ายมาเกิดใหม่ใกล้ๆ แทน
      if (!e.boss && d > 520) {
        e.disableBody(true, true);
        this.spawnEnemy(e.kind, { elite: e.elite });
      }
    }
  }

  // ติดไฟ/พิษ เสียเลือดทุกเฟรม และสีตัวบอกสถานะ (กะพริบขาวตอนโดนตีสำคัญกว่า)
  private updateStatus(e: Enemy, now: number) {
    const dps = (now < e.burnUntil ? e.burnDps : 0) + (now < e.poisonUntil ? e.poisonDps : 0);
    if (dps > 0) {
      e.dot += (dps * this.lastDt) / 1000;
      if (e.dot >= 1) {
        const n = Math.floor(e.dot);
        e.dot -= n;
        this.hurtEnemy(e, n, false);
        if (!e.active) return;
      }
    }
    const tint = now < e.flashUntil ? -1
      : now < e.stunUntil ? 0xffe9a0
      : now < e.slowUntil ? 0x9fe8ff
      : now < e.burnUntil ? 0xff9a7a
      : now < e.poisonUntil ? 0xa8f08a
      : 0;
    if (tint === e.statusTint) return;
    e.statusTint = tint;
    if (tint === -1) e.setTintFill(0xffffff);
    else if (tint) e.setTint(tint);
    else e.clearTint();
  }

  // โดนสกิล: ใส่ผลของธาตุ แล้วค่อยลดเลือด
  private hit(e: Enemy, dmg: number, els: Element[], chained = false) {
    if (!e.active) return;
    const now = this.elapsed;
    let d = dmg;
    for (const el of els) {
      switch (el) {
        case 'fire':
          e.burnUntil = now + 3000;
          e.burnDps = Math.max(e.burnDps, dmg * 0.3);
          break;
        case 'ice':
          e.slowUntil = now + 2000;
          break;
        case 'earth':
          d *= 1.25;
          if (!e.boss) e.stunUntil = now + 450;
          break;
        case 'light':
          if (Math.random() < 0.3) d *= 2;
          break;
        case 'dark':
          this.heal(Math.max(0.2, dmg * 0.03));
          break;
        case 'poison':
          e.poisonUntil = now + 4000;
          e.poisonDps = Math.max(e.poisonDps, dmg * 0.25);
          break;
        case 'wind':
          if (!e.boss) {
            const { x, y } = this.me.sprite;
            const a = Math.atan2(e.y - y, e.x - x);
            e.setPosition(e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18);
          }
          break;
        case 'thunder':
          if (!chained) {
            const skip = new Set<Enemy>([e]);
            for (let i = 0; i < 2; i++) {
              const t = this.nearest(e.x, e.y, 70, skip);
              if (!t) break;
              skip.add(t);
              const g = this.add.graphics().setDepth(9).lineStyle(2, ELEMENTS.thunder.color, 0.9).lineBetween(e.x, e.y, t.x, t.y);
              this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
              this.hit(t, dmg * 0.5, ['thunder'], true);
            }
          }
          break;
      }
    }
    this.hurtEnemy(e, d);
  }

  private heal(n: number) {
    this.healDebt += n;
    if (this.healDebt >= 1) {
      this.hp = Math.min(this.stats.maxHp, this.hp + Math.floor(this.healDebt));
      this.healDebt %= 1;
    }
  }

  private hurtEnemy(e: Enemy, dmg: number, flash = true) {
    if (!e.active) return;
    e.hp -= dmg;
    if (flash) e.flashUntil = this.elapsed + 70;
    if (e.hp > 0) return;
    this.kills++;
    this.ult = Math.min(100, this.ult + (e.elite ? 10 : 1) * (100 / ULT_KILLS));
    const { x, y } = e;
    // ตายตอนติดพิษ = พิษแพร่ไปตัวข้างๆ
    if (this.elapsed < e.poisonUntil) {
      for (const t of this.enemiesNear(x, y, 40).slice(0, 2)) {
        if (t === e) continue;
        t.poisonUntil = this.elapsed + 4000;
        t.poisonDps = Math.max(t.poisonDps, e.poisonDps);
      }
    }
    e.disableBody(true, true);
    const poof = this.add.sprite(x, y, 'fx-smoke').setScale(0.5).setDepth(6);
    poof.play('fx-smoke');
    poof.once('animationcomplete', () => poof.destroy());
    if (e.boss) {
      this.bossRef = undefined;
      this.finish(true);
      return;
    }
    if (e.elite) {
      this.drop('gem5', x, y);
      for (let i = 0; i < 5; i++) this.drop('coin', x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10));
    } else {
      this.drop('gem', x, y);
      const r = Math.random();
      if (r < 0.04) this.drop('coin', x + 4, y);
      else if (r < 0.052) this.drop('heart', x + 4, y);
    }
  }

  private touchEnemy(e: Enemy) {
    if (this.over || this.elapsed < this.hurtUntil || !e.active) return;
    this.hurtUntil = this.elapsed + HURT_MS;
    this.hp = Math.max(0, this.hp - e.damage);
    this.cameras.main.shake(120, 0.004);
    if (this.hp <= 0) this.finish(false);
  }

  // ---------- อาวุธ ----------
  // เล็ง: มือถือ = มอนที่ใกล้สุด / คอม = ทางเมาส์ (ถ้าไม่ได้ขยับเมาส์ 3 วินาที = มอนที่ใกล้สุด)
  private aim(): number | null {
    const { x, y } = this.me.sprite;
    if (!this.touch && this.elapsed - this.lastMouseMove < 3000) {
      const p = this.input.activePointer;
      p.updateWorldPoint(this.cameras.main);
      return Math.atan2(p.worldY - y, p.worldX - x);
    }
    // บอสอยู่ใกล้ = เล็งบอสก่อน (ไม่งั้นลูกน้องที่อยู่ใกล้กว่าจะบังตลอด)
    const b = this.bossRef;
    const near = b?.active && (b.x - x) ** 2 + (b.y - y) ** 2 < 200 * 200 ? b : this.nearest(x, y, 260);
    return near ? Math.atan2(near.y - y, near.x - x) : null;
  }

  private enemiesNear(x: number, y: number, r: number) {
    const out: Enemy[] = [];
    const r2 = r * r;
    for (const e of this.enemies.getChildren() as unknown as Enemy[]) {
      if (!e.active) continue;
      const pad = e.boss ? 16 : e.elite ? 6 : 0; // ตัวใหญ่โดนง่ายขึ้น
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy < r2 + pad * (2 * r + pad)) out.push(e);
    }
    return out;
  }

  private skillHost(): SkillHost<Enemy> {
    return {
      scene: this,
      player: () => this.me.sprite,
      aimAngle: () => this.aim(),
      enemiesNear: (x, y, r) => this.enemiesNear(x, y, r),
      nearest: (x, y, r, skip) => this.nearest(x, y, r, skip),
      hit: (e, dmg, els) => this.hit(e, dmg, els),
      power: () => 1 + 0.25 * this.levels.dmg,
      haste: () => 1 + 0.18 * this.levels.rate,
      heal: (n) => this.heal(n),
      now: () => this.elapsed,
    };
  }

  // ท่าไม้ตาย: เกจเต็มแล้วกด Space (หรือปุ่มบนจอ)
  private useUlt() {
    if (this.paused || this.over || this.ult < 100) return;
    this.ult = 0;
    this.skills.ultimate(this.special);
    this.bridge.emit('ult-cast', { name: this.special.ult.name, emoji: ELEMENTS[this.special.ult.element].emoji });
    this.emitHud(true);
  }

  private nearest(x: number, y: number, range: number, skip?: Set<Enemy>) {
    let best: Enemy | undefined;
    let bd = range * range;
    for (const e of this.enemies.getChildren() as unknown as Enemy[]) {
      if (!e.active || skip?.has(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) [best, bd] = [e, d];
    }
    return best;
  }

  private shoot(now: number) {
    if (now < this.nextShot) return;
    const a = this.aim();
    if (a === null) return;
    this.nextShot = now + this.stats.cooldown * 1000;
    const n = this.stats.count;
    const spread = 0.18;
    for (let i = 0; i < n; i++) {
      const ang = a + (i - (n - 1) / 2) * spread;
      const b = this.bullets.get(this.me.sprite.x, this.me.sprite.y, 'fx-shuriken') as Bullet | null;
      if (!b) return;
      b.enableBody(true, this.me.sprite.x, this.me.sprite.y, true, true);
      b.setDepth(8).setScale(0.75);
      b.body!.setCircle(6, 2, 2);
      b.setVelocity(Math.cos(ang) * BULLET_SPEED, Math.sin(ang) * BULLET_SPEED);
      b.bornAt = now;
      b.pierceLeft = this.stats.pierce;
      b.hits = new Set();
    }
  }

  private updateBullets(now: number) {
    for (const b of this.bullets.getChildren() as Bullet[]) {
      if (!b.active) continue;
      b.rotation += 0.35;
      if (now - b.bornAt > BULLET_LIFE) b.disableBody(true, true);
    }
  }

  private bulletHit(b: Bullet, e: Enemy) {
    if (!b.active || !e.active || b.hits.has(e)) return;
    b.hits.add(e);
    this.hurtEnemy(e, this.stats.damage);
    if (b.pierceLeft-- <= 0) b.disableBody(true, true);
  }

  // ---------- ของที่ตก ----------
  private drop(kind: Drop['kind'], x: number, y: number) {
    if (this.drops.length > 400) {
      // ของบนพื้นเยอะเกิน: รวมคริสตัลเก่าสุดเข้าตัวเลย จะได้ไม่หน่วง
      const old = this.drops.shift()!;
      this.collect(old);
    }
    const key = kind === 'gem' ? 'fx-gem' : kind === 'gem5' ? 'fx-gem5' : kind === 'coin' ? 'fx-coin' : 'fx-heart';
    const img = this.add.image(x, y, key).setDepth(2).setScale(kind === 'gem' ? 0.5 : kind === 'gem5' ? 0.7 : 1);
    this.drops.push({ img, kind, flying: false });
  }

  private updateDrops(dt: number) {
    const { x, y } = this.me.sprite;
    const r2 = this.stats.pickup ** 2;
    const step = (dt / 1000) * 320;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const dx = x - d.img.x;
      const dy = y - d.img.y;
      const dd = dx * dx + dy * dy;
      if (!d.flying && dd < r2) d.flying = true;
      if (!d.flying) continue;
      const len = Math.sqrt(dd);
      if (len < 8) {
        this.drops.splice(i, 1);
        this.collect(d);
        continue;
      }
      d.img.setPosition(d.img.x + (dx / len) * Math.min(step, len), d.img.y + (dy / len) * Math.min(step, len));
    }
  }

  private collect(d: Drop) {
    d.img.destroy();
    if (d.kind === 'coin') this.coins++;
    else if (d.kind === 'heart') this.hp = Math.min(this.stats.maxHp, this.hp + 20);
    else this.gainXp(d.kind === 'gem5' ? 10 : 1);
  }

  private gainXp(n: number) {
    this.xp += n;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0 && !this.paused) this.offerLevelUp();
  }

  private offerLevelUp() {
    this.setPaused(true);
    this.me.sprite.setVelocity(0, 0);
    const choices = this.rollChoices();
    this.emitHud(true);
    this.bridge.emit('levelup', { level: this.level - this.pendingLevels + 1, choices });
  }

  // สุ่ม 3 ตัวเลือก: ถ้าผสมสกิลได้จะมีให้เลือกเสมอ ที่เหลือคละสกิลใหม่ อัปสกิลเดิม และอัปค่าตัว
  private rollChoices(): LevelUpChoice[] {
    const owned = this.skills.owned;
    const out: LevelUpChoice[] = [];
    const used = new Set<string>();
    const push = (c: LevelUpChoice) => {
      const key = c.kind === 'heal' ? 'heal' : c.kind + c.id;
      if (used.has(key) || out.length >= 3) return;
      used.add(key);
      out.push(c);
    };
    // ผสม
    const fusions: LevelUpChoice[] = [];
    for (let i = 0; i < owned.length; i++) {
      for (let j = i + 1; j < owned.length; j++) {
        const a = owned[i];
        const b = owned[j];
        if (a.level < FUSE_LEVEL || b.level < FUSE_LEVEL) continue;
        const f = fusionOf(a.def, b.def);
        if (!f || owned.some((o) => o.def.id === f.id)) continue;
        fusions.push({ kind: 'fuse', id: f.id, a: a.def.id, b: b.def.id, name: `${f.name}`, emoji: f.emoji, desc: `ผสม ${a.def.name} + ${b.def.name} • ${describeSkill(f)}`, next: Math.max(a.level, b.level) });
      }
    }
    if (fusions.length) push(Phaser.Utils.Array.GetRandom(fusions));

    const pool: LevelUpChoice[] = [];
    for (const o of owned) {
      if (o.level < MAX_SKILL_LEVEL) pool.push(this.skillChoice(o.def, o.level + 1));
    }
    if (owned.length < MAX_SKILLS) {
      // สกิลใหม่: ครึ่งหนึ่งเลือกตัวที่ผสมกับของที่มีได้ (ธาตุหรือรูปแบบเดียวกัน)
      const fresh = BASE_SKILLS.filter((d) => !owned.some((o) => o.def.id === d.id || (o.def.fused && o.def.elements.includes(d.elements[0]) && o.def.forms.includes(d.forms[0]))));
      const friends = fresh.filter((d) => owned.some((o) => !o.def.fused && (o.def.elements[0] === d.elements[0] || o.def.forms[0] === d.forms[0])));
      for (let i = 0; i < 2; i++) {
        const src = friends.length && Math.random() < 0.5 ? friends : fresh;
        if (src.length) pool.push(this.skillChoice(Phaser.Utils.Array.GetRandom(src), 1));
      }
    }
    for (const id of Phaser.Utils.Array.Shuffle(openUpgrades(this.levels)).slice(0, 2)) {
      const u = UPGRADES[id];
      pool.push({ kind: 'stat', id, name: u.name, emoji: u.emoji, desc: u.desc(this.levels[id] + 1), next: this.levels[id] + 1 });
    }
    for (const c of Phaser.Utils.Array.Shuffle(pool)) push(c);
    while (out.length < 3) push({ kind: 'heal', name: 'ข้าวปั้น', emoji: '🍙', desc: 'ฟื้นเลือด 30' });
    return out;
  }

  private skillChoice(d: SkillDef, next: number): LevelUpChoice {
    return { kind: 'skill', id: d.id, name: d.name, emoji: d.emoji, desc: describeSkill(d), next, fused: d.fused };
  }

  private applyPick(c: LevelUpChoice) {
    if (this.pendingLevels <= 0 || this.over) return;
    this.pendingLevels--;
    if (c.kind === 'heal') {
      this.hp = Math.min(this.stats.maxHp, this.hp + 30);
    } else if (c.kind === 'stat') {
      this.levels[c.id]++;
      const before = this.stats.maxHp;
      this.stats = statsOf(this.levels);
      if (c.id === 'hp') this.hp = Math.min(this.stats.maxHp, this.hp + (this.stats.maxHp - before));
    } else if (c.kind === 'skill') {
      const d = SKILL_BY_ID.get(c.id);
      if (d) this.skills.add(d);
    } else {
      const d = SKILL_BY_ID.get(c.id);
      if (d) {
        this.skills.remove(c.a);
        this.skills.remove(c.b);
        this.skills.add(d, c.next);
        this.bridge.emit('toast', `✨ ผสมสำเร็จ! ได้ ${d.emoji} ${d.name}`);
      }
    }
    const tag = makeLabel(this, '⬆️ เลเวลอัป!', '#ffcf5c').setOrigin(0.5).setPosition(this.me.sprite.x, this.me.sprite.y - 20);
    this.tweens.add({ targets: tag, y: tag.y - 14, alpha: 0, duration: 900, onComplete: () => tag.destroy() });
    if (this.pendingLevels > 0) {
      this.paused = false; // ให้ offerLevelUp หยุดใหม่ได้
      this.offerLevelUp();
    } else {
      this.setPaused(this.menuPaused);
    }
    this.emitHud(true);
  }

  // ---------- จบรอบ ----------
  private finish(won: boolean) {
    if (this.over) return;
    this.over = true;
    this.physics.pause();
    this.me.sprite.setVelocity(0, 0);
    this.emitHud(true);
    const result: RunResult = { won, sec: Math.floor(this.elapsed / 1000), kills: this.kills, level: this.level, coins: this.coins };
    this.time.delayedCall(won ? 400 : 700, () => this.bridge.emit('end', result));
  }

  private emitHud(force = false) {
    if (!force && this.elapsed - this.lastHud < HUD_MS) return;
    this.lastHud = this.elapsed;
    const hud: Hud = {
      hp: Math.ceil(this.hp),
      maxHp: this.stats.maxHp,
      xp: this.xp,
      need: xpToNext(this.level),
      level: this.level,
      sec: Math.floor(this.elapsed / 1000),
      kills: this.kills,
      coins: this.coins,
      boss: this.bossRef?.active ? this.bossRef.hp / this.bossRef.maxHp : undefined,
      skills: this.skills.owned.map((o) => ({ id: o.def.id, name: o.def.name, emoji: o.def.emoji, level: o.level, fused: o.def.fused })),
      ult: this.ult,
      ultName: this.special.ult.name,
    };
    this.bridge.emit('hud', hud);
  }
}
