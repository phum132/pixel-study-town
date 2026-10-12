import Phaser from 'phaser';
import { ELEMENTS, FORMS, MAX_SKILL_LEVEL, type Element, type Form, type SkillDef, type Special } from '../lib/skills';

// ตัวทำงานของสกิลในสนามรบ: ใช้สกิลตามคูลดาวน์ วาดเอฟเฟกต์ และส่งความแรง+ธาตุให้ฉากไปทำผลกับมอน

// ภาพเอฟเฟกต์ (public/assets/fx/skills) ขนาดเฟรมตรวจจากภาพจริงแล้ว
const SHEETS: Record<string, { w: number; h: number; n: number }> = {
  'p-fire': { w: 16, h: 16, n: 4 },
  'p-ice': { w: 18, h: 10, n: 8 },
  'p-earth': { w: 16, h: 16, n: 4 },
  'p-poison': { w: 24, h: 20, n: 4 },
  'p-white': { w: 16, h: 16, n: 4 },
  'i-fire': { w: 25, h: 30, n: 8 },
  'i-ice': { w: 32, h: 32, n: 10 },
  'i-thunder': { w: 20, h: 28, n: 8 },
  'i-wind': { w: 32, h: 32, n: 5 },
  'i-earth': { w: 30, h: 30, n: 14 },
  'i-light': { w: 27, h: 35, n: 10 },
  'i-dark': { w: 25, h: 24, n: 5 },
  'i-poison': { w: 30, h: 28, n: 8 },
  ring: { w: 32, h: 32, n: 4 },
  slash: { w: 32, h: 32, n: 4 },
  trap: { w: 53, h: 35, n: 8 },
  boom: { w: 40, h: 40, n: 9 },
};
const OWN_PROJECTILE: Partial<Record<Element, string>> = { fire: 'p-fire', ice: 'p-ice', earth: 'p-earth', poison: 'p-poison' };
// ภาพที่ย้อมสีตามธาตุได้ (ภาพสีขาว/เทา)
const TINTABLE = new Set(['p-white', 'i-wind', 'i-dark', 'ring', 'slash', 'trap']);

export function preloadSkillFx(scene: Phaser.Scene) {
  for (const [key, s] of Object.entries(SHEETS)) scene.load.spritesheet(`sk-${key}`, `assets/fx/skills/${key}.png`, { frameWidth: s.w, frameHeight: s.h });
}

export function createSkillAnims(scene: Phaser.Scene) {
  for (const [key, s] of Object.entries(SHEETS)) {
    const k = `sk-${key}`;
    if (!scene.anims.exists(k)) {
      const loop = key.startsWith('p-') || key === 'trap';
      scene.anims.create({ key: k, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: s.n - 1 }), frameRate: loop ? 10 : 22, repeat: loop ? -1 : 0 });
    }
  }
}

// สิ่งที่ฉากต้องมีให้ตัวสกิลเรียกใช้
export type Target = { x: number; y: number; active: boolean };
export interface SkillHost<T extends Target> {
  scene: Phaser.Scene;
  player(): { x: number; y: number };
  aimAngle(): number | null;
  enemiesNear(x: number, y: number, r: number): T[];
  nearest(x: number, y: number, r: number, skip?: Set<T>): T | undefined;
  hit(e: T, dmg: number, elements: Element[]): void;
  power(): number; // ตัวคูณความแรงจากอัปเกรด
  haste(): number; // ตัวหารคูลดาวน์จากอัปเกรด
  heal(n: number): void;
  now(): number;
}

type Owned = { def: SkillDef; level: number; nextAt: number; orbs: Phaser.GameObjects.Sprite[]; orbHit: WeakMap<object, number> };
type Shot<T> = {
  img: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  until: number;
  dmg: number;
  els: Element[];
  pierce: number;
  hits: Set<T>;
  // ระเบิด: บินไปถึงจุดแล้วตูม
  boom?: { x: number; y: number; r: number };
};
type Zone = { x: number; y: number; r: number; until: number; nextTick: number; dmg: number; els: Element[]; fx: Phaser.GameObjects.Sprite; ring: Phaser.GameObjects.Arc };
type Wave<T> = { x: number; y: number; r: number; max: number; speed: number; dmg: number; els: Element[]; hits: Set<T>; fx: Phaser.GameObjects.Graphics };

export class SkillEngine<T extends Target> {
  owned: Owned[] = [];
  private shots: Shot<T>[] = [];
  private zones: Zone[] = [];
  private waves: Wave<T>[] = [];
  private spin?: { until: number; angle: number; els: Element[]; dmg: number; g: Phaser.GameObjects.Graphics; nextHit: WeakMap<object, number> };

  private host: SkillHost<T>;

  constructor(host: SkillHost<T>) {
    this.host = host;
  }

  private get scene() {
    return this.host.scene;
  }

  levelOf(id: string) {
    return this.owned.find((o) => o.def.id === id)?.level ?? 0;
  }

  add(def: SkillDef, level = 1) {
    const cur = this.owned.find((o) => o.def.id === def.id);
    if (cur) {
      cur.level = Math.min(MAX_SKILL_LEVEL, cur.level + 1);
      return;
    }
    this.owned.push({ def, level, nextAt: this.host.now() + 400, orbs: [], orbHit: new WeakMap() });
  }

  remove(id: string) {
    const i = this.owned.findIndex((o) => o.def.id === id);
    if (i < 0) return;
    this.owned[i].orbs.forEach((o) => o.destroy());
    this.owned.splice(i, 1);
  }

  private dmgOf(o: Owned, form: Form) {
    return FORMS[form].dmg * (1 + 0.35 * (o.level - 1)) * (o.def.fused ? 1.35 : 1) * this.host.power();
  }

  // ---------- วนทุกเฟรม ----------
  update(dt: number) {
    const now = this.host.now();
    for (const o of this.owned) {
      this.updateOrbs(o, dt, now);
      const casts = o.def.forms.filter((f) => f !== 'orbit');
      if (!casts.length || now < o.nextAt) continue;
      const cd = Math.max(...casts.map((f) => FORMS[f].cd)) * (o.def.fused ? 0.9 : 1) / this.host.haste();
      // ยังไม่มีมอนใกล้ๆ = รอก่อน (ไม่เสียคูลดาวน์ทิ้ง)
      const p = this.host.player();
      if (!this.host.nearest(p.x, p.y, 240)) continue;
      o.nextAt = now + cd * 1000;
      for (const f of casts) this.cast(o, f);
    }
    this.updateShots(dt, now);
    this.updateZones(now);
    this.updateWaves(dt);
    this.updateSpin(dt, now);
  }

  private color(els: Element[], i = 0) {
    return ELEMENTS[els[i % els.length]].color;
  }

  private fx(key: string, x: number, y: number, els: Element[], opt: { scale?: number; angle?: number; depth?: number; i?: number } = {}) {
    const s = this.scene.add.sprite(x, y, `sk-${key}`).setDepth(opt.depth ?? 9).setScale(opt.scale ?? 1).setAngle(opt.angle ?? 0);
    if (TINTABLE.has(key)) s.setTint(this.color(els, opt.i));
    s.play(`sk-${key}`);
    s.once('animationcomplete', () => s.destroy());
    return s;
  }

  private impact(x: number, y: number, els: Element[], scale = 1) {
    els.forEach((e, i) => this.fx(`i-${e}`, x + i * 4, y - i * 4, els, { scale, i }));
  }

  private cast(o: Owned, form: Form) {
    const p = this.host.player();
    const els = o.def.elements;
    const dmg = this.dmgOf(o, form);
    const lvl = o.level;
    switch (form) {
      case 'bolt': {
        const n = 1 + Math.floor(lvl / 2);
        const skip = new Set<T>();
        for (let i = 0; i < n; i++) {
          const t = this.host.nearest(p.x, p.y, 260, skip);
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : (this.host.aimAngle() ?? 0) + i * 0.3;
          if (t) skip.add(t);
          this.shoot(p.x, p.y, a, 210, dmg, els, Math.floor(lvl / 3), i);
        }
        break;
      }
      case 'bomb': {
        const n = 1 + Math.floor(lvl / 3);
        for (let i = 0; i < n; i++) {
          const list = this.host.enemiesNear(p.x, p.y, 200);
          const t = list[Math.floor(Math.random() * list.length)];
          if (!t) break;
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          const d = Math.hypot(t.x - p.x, t.y - p.y);
          const shot = this.shoot(p.x, p.y, a, 170, dmg, els, 99, i);
          shot.until = this.host.now() + (d / 170) * 1000;
          shot.boom = { x: t.x, y: t.y, r: 34 + 6 * lvl };
          shot.img.setScale(1.3);
        }
        break;
      }
      case 'rain': {
        const list = this.host.enemiesNear(p.x, p.y, 230);
        Phaser.Utils.Array.Shuffle(list);
        list.slice(0, 2 + lvl).forEach((t, i) => {
          this.scene.time.delayedCall(i * 70, () => {
            if (!t.active) return;
            this.impact(t.x, t.y, els, 1.2);
            this.host.hit(t, dmg, els);
          });
        });
        break;
      }
      case 'nova':
        this.wave(p.x, p.y, 80 + 10 * lvl, dmg, els);
        break;
      case 'beam': {
        const a = this.aimAt(p);
        this.beam(p.x, p.y, a, 210, 10 + 2 * lvl, dmg, els);
        break;
      }
      case 'trap': {
        const list = this.host.enemiesNear(p.x, p.y, 200);
        const t = list[Math.floor(Math.random() * list.length)];
        if (t) this.zone(t.x, t.y, 30 + 4 * lvl, 3000, dmg, els);
        break;
      }
      case 'slash': {
        const a = this.aimAt(p);
        this.slash(p.x, p.y, a, 48 + 4 * lvl, dmg, els);
        break;
      }
      default:
        break;
    }
  }

  private aimAt(p: { x: number; y: number }) {
    const t = this.host.nearest(p.x, p.y, 240);
    return t ? Math.atan2(t.y - p.y, t.x - p.x) : this.host.aimAngle() ?? 0;
  }

  // ---------- ชิ้นส่วนเอฟเฟกต์ ----------
  private shoot(x: number, y: number, a: number, speed: number, dmg: number, els: Element[], pierce: number, i = 0): Shot<T> {
    const e = els[i % els.length];
    const key = OWN_PROJECTILE[e] ?? 'p-white';
    const img = this.scene.add.sprite(x, y, `sk-${key}`).setDepth(8).setRotation(a);
    if (key === 'p-white') img.setTint(ELEMENTS[e].color);
    img.play(`sk-${key}`);
    const shot: Shot<T> = { img, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, until: this.host.now() + 1300, dmg, els, pierce, hits: new Set() };
    this.shots.push(shot);
    return shot;
  }

  private updateShots(dt: number, now: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.img.x += (s.vx * dt) / 1000;
      s.img.y += (s.vy * dt) / 1000;
      if (s.boom) {
        if (now >= s.until) {
          this.explode(s.boom.x, s.boom.y, s.boom.r, s.dmg, s.els);
          s.img.destroy();
          this.shots.splice(i, 1);
        }
        continue;
      }
      let done = now >= s.until;
      if (!done) {
        for (const t of this.host.enemiesNear(s.img.x, s.img.y, 10)) {
          if (s.hits.has(t)) continue;
          s.hits.add(t);
          this.host.hit(t, s.dmg, s.els);
          if (s.pierce-- <= 0) {
            done = true;
            this.impact(s.img.x, s.img.y, s.els, 0.6);
            break;
          }
        }
      }
      if (done) {
        s.img.destroy();
        this.shots.splice(i, 1);
      }
    }
  }

  explode(x: number, y: number, r: number, dmg: number, els: Element[]) {
    const scale = r / 20;
    this.fx('boom', x, y, els, { scale: scale * 0.9, depth: 9 });
    this.impact(x, y, els, scale * 0.7);
    for (const t of this.host.enemiesNear(x, y, r)) this.host.hit(t, dmg, els);
    this.scene.cameras.main.shake(80, 0.002);
  }

  wave(x: number, y: number, max: number, dmg: number, els: Element[], speed = 240) {
    const fx = this.scene.add.graphics().setDepth(7); // วาดวงเรืองแสงเอง (ขยายภาพพิกเซลแล้วแตก)
    this.waves.push({ x, y, r: 4, max, speed, dmg, els, hits: new Set(), fx });
  }

  private updateWaves(dt: number) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += (w.speed * dt) / 1000;
      const fade = Math.max(0, 1 - w.r / w.max);
      w.fx.clear().fillStyle(this.color(w.els), 0.12 * fade).fillCircle(w.x, w.y, w.r);
      w.els.forEach((_, k) => w.fx.lineStyle(6 - k * 2, this.color(w.els, k), 0.5 * fade).strokeCircle(w.x, w.y, w.r - k * 3));
      w.fx.lineStyle(2, 0xffffff, 0.9 * fade).strokeCircle(w.x, w.y, w.r);
      for (const t of this.host.enemiesNear(w.x, w.y, w.r)) {
        if (w.hits.has(t)) continue;
        w.hits.add(t);
        this.host.hit(t, w.dmg, w.els);
      }
      if (w.r >= w.max) {
        w.fx.destroy();
        this.waves.splice(i, 1);
      }
    }
  }

  beam(x: number, y: number, a: number, len: number, width: number, dmg: number, els: Element[]) {
    const g = this.scene.add.graphics().setDepth(9);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    els.forEach((_, i) => {
      g.lineStyle(width + 4 - i * 3, this.color(els, i), 0.35).lineBetween(x, y, ex, ey);
    });
    g.lineStyle(Math.max(2, width / 3), 0xffffff, 0.9).lineBetween(x, y, ex, ey);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 280, onComplete: () => g.destroy() });
    this.impact(ex, ey, els, 0.9);
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    for (const t of this.host.enemiesNear(x, y, len)) {
      const px = t.x - x;
      const py = t.y - y;
      const along = px * nx + py * ny;
      const off = Math.abs(px * ny - py * nx);
      if (along > 0 && along < len && off < width / 2 + 6) this.host.hit(t, dmg, els);
    }
  }

  zone(x: number, y: number, r: number, ms: number, dmg: number, els: Element[]) {
    const now = this.host.now();
    const ring = this.scene.add.circle(x, y, r, this.color(els), 0.18).setDepth(2).setStrokeStyle(1, this.color(els), 0.7);
    const fx = this.scene.add.sprite(x, y - 6, 'sk-trap').setTint(this.color(els)).setDepth(3).setScale(r / 26).setAlpha(0.8);
    fx.play('sk-trap');
    this.zones.push({ x, y, r, until: now + ms, nextTick: now, dmg, els, fx, ring });
  }

  private updateZones(now: number) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (now >= z.nextTick) {
        z.nextTick = now + 450;
        for (const t of this.host.enemiesNear(z.x, z.y, z.r)) this.host.hit(t, z.dmg, z.els);
      }
      if (now >= z.until) {
        z.fx.destroy();
        z.ring.destroy();
        this.zones.splice(i, 1);
      }
    }
  }

  slash(x: number, y: number, a: number, r: number, dmg: number, els: Element[]) {
    const s = this.fx('slash', x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, els, { scale: r / 20, depth: 9 });
    s.setRotation(a);
    for (const t of this.host.enemiesNear(x, y, r)) {
      const d = Phaser.Math.Angle.Wrap(Math.atan2(t.y - y, t.x - x) - a);
      if (Math.abs(d) < 1.25) this.host.hit(t, dmg, els);
    }
  }

  private updateOrbs(o: Owned, dt: number, now: number) {
    if (!o.def.forms.includes('orbit')) return;
    const n = 2 + Math.floor(o.level / 2);
    const els = o.def.elements;
    while (o.orbs.length < n) {
      const e = els[o.orbs.length % els.length];
      const key = OWN_PROJECTILE[e] ?? 'p-white';
      const s = this.scene.add.sprite(0, 0, `sk-${key}`).setDepth(8);
      if (key === 'p-white') s.setTint(ELEMENTS[e].color);
      s.play(`sk-${key}`);
      o.orbs.push(s);
    }
    const p = this.host.player();
    const base = (now / 1000) * 3 * (o.def.fused ? 1.2 : 1);
    const radius = 46 + o.level * 2;
    const dmg = this.dmgOf(o, 'orbit');
    o.orbs.forEach((s, i) => {
      const a = base + (i * Math.PI * 2) / o.orbs.length;
      s.setPosition(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius).setRotation(a + Math.PI / 2);
      for (const t of this.host.enemiesNear(s.x, s.y, 11)) {
        if ((o.orbHit.get(t) ?? 0) > now) continue;
        o.orbHit.set(t, now + 400);
        this.host.hit(t, dmg, els);
      }
    });
    void dt;
  }

  // ---------- ท่าไม้ตาย ----------
  ultimate(sp: Special) {
    const p = this.host.player();
    const { kind, element } = sp.ult;
    const els = [element];
    const big = 60 * this.host.power();
    const cam = this.scene.cameras.main;
    const c = ELEMENTS[element].color;
    cam.flash(350, (c >> 16) & 255, (c >> 8) & 255, c & 255);
    cam.shake(400, 0.006);
    if (sp.ult.heal) this.host.heal(sp.ult.heal);
    const onScreen = () => this.host.enemiesNear(p.x, p.y, 260);
    switch (kind) {
      case 'storm':
        for (let i = 0; i < 24; i++) {
          this.scene.time.delayedCall(i * 60, () => {
            const list = onScreen();
            const t = list[Math.floor(Math.random() * list.length)];
            const x = t ? t.x : p.x + Phaser.Math.Between(-180, 180);
            const y = t ? t.y : p.y + Phaser.Math.Between(-110, 110);
            this.explode(x, y, 30, big, els);
          });
        }
        break;
      case 'nova':
        for (let i = 0; i < 3; i++) this.scene.time.delayedCall(i * 180, () => this.wave(p.x, p.y, 280, big * 1.2, els, 320));
        break;
      case 'freeze':
        this.wave(p.x, p.y, 300, big, els, 400);
        for (const t of onScreen()) this.host.hit(t, big * 0.5, ['ice', 'earth']);
        break;
      case 'chain': {
        const hitSet = new Set<T>();
        let from = { x: p.x, y: p.y };
        const g = this.scene.add.graphics().setDepth(9);
        for (let i = 0; i < 25; i++) {
          const t = this.host.nearest(from.x, from.y, 200, hitSet);
          if (!t) break;
          hitSet.add(t);
          g.lineStyle(3, c, 0.9).lineBetween(from.x, from.y, t.x, t.y);
          this.fx('i-thunder', t.x, t.y, els, { scale: 1.3 });
          this.host.hit(t, big * 1.3, els);
          from = t;
        }
        this.scene.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() });
        break;
      }
      case 'blades':
        for (let i = 0; i < 12; i++) {
          this.scene.time.delayedCall(i * 50, () => this.slash(p.x, p.y, (i * Math.PI * 2) / 12, 90, big, els));
        }
        break;
      case 'meteor':
        for (let i = 0; i < 14; i++) {
          this.scene.time.delayedCall(i * 110, () => {
            const list = onScreen();
            const t = list[Math.floor(Math.random() * list.length)];
            if (t) this.explode(t.x, t.y, 48, big * 1.5, els);
          });
        }
        break;
      case 'spin':
        this.spin?.g.destroy();
        this.spin = { until: this.host.now() + 2600, angle: 0, els: ['light', 'fire'], dmg: big * 0.5, g: this.scene.add.graphics().setDepth(9), nextHit: new WeakMap() };
        break;
      case 'garden':
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI * 2) / 8;
          this.zone(p.x + Math.cos(a) * 80, p.y + Math.sin(a) * 60, 40, 5000, big * 0.4, els);
        }
        this.zone(p.x, p.y, 50, 5000, big * 0.4, els);
        break;
    }
  }

  private updateSpin(dt: number, now: number) {
    const s = this.spin;
    if (!s) return;
    if (now >= s.until) {
      s.g.destroy();
      this.spin = undefined;
      return;
    }
    s.angle += (dt / 1000) * 5;
    const p = this.host.player();
    s.g.clear();
    for (let k = 0; k < 2; k++) {
      const a = s.angle + k * Math.PI;
      const ex = p.x + Math.cos(a) * 230;
      const ey = p.y + Math.sin(a) * 230;
      s.g.lineStyle(16, ELEMENTS.fire.color, 0.3).lineBetween(p.x, p.y, ex, ey);
      s.g.lineStyle(8, ELEMENTS.light.color, 0.6).lineBetween(p.x, p.y, ex, ey);
      s.g.lineStyle(3, 0xffffff, 0.95).lineBetween(p.x, p.y, ex, ey);
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      for (const t of this.host.enemiesNear(p.x, p.y, 230)) {
        const px = t.x - p.x;
        const py = t.y - p.y;
        if (px * nx + py * ny > 0 && Math.abs(px * ny - py * nx) < 14 && (s.nextHit.get(t) ?? 0) <= now) {
          s.nextHit.set(t, now + 250);
          this.host.hit(t, s.dmg, s.els);
        }
      }
    }
  }
}
