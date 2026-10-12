import { randomUUID } from 'node:crypto';
import { Room, type Client } from 'colyseus';
import type { PlayerIdentity } from '../supabase.js';
import { Player, WorldState } from './WorldState.js';

const SPEED = 80; // ต้องตรงกับความเร็วในฝั่งเกม
const DIRS = new Set(['down', 'up', 'left', 'right']);
const CHAT_MAX_LENGTH = 200;
const CHAT_COOLDOWN_MS = 800;
const HISTORY_SIZE = 30;
// งบระยะเดิน: สะสมตามเวลาที่ผ่านไป (เผื่อ 1.5 เท่า สำหรับเน็ตกระตุก) เก็บได้สูงสุด 2 วินาที
const MOVE_SLACK = 1.5;
const MOVE_BUDGET_CAP = SPEED * MOVE_SLACK * 2 + 8;
// จำกัดจำนวนข้อความต่อคน (เกม ส่งตำแหน่งแค่ 10 ครั้ง/วินาที คนปกติไม่มีทางถึง)
const MSG_SOFT_LIMIT = 30; // เกินนี้ใน 1 วินาที = ทิ้งข้อความ
const MSG_HARD_LIMIT = 80; // เกินนี้ = เตะออก
const RECONNECT_SECONDS = 20; // เน็ตหลุดแป๊บเดียว (เช่น สลับแอปในมือถือ) กลับมาที่เดิมได้

// รหัสตอนเซิร์ฟเวอร์เชิญออก (ฝั่งเว็บใช้แสดงข้อความ ดู LEAVE_REASONS ใน client/src/ui/WorldView.tsx)
// ห้ามใช้ 4000-4010: Colyseus จองไว้ (4000 = ปิดปกติ/รีสตาร์ทเซิร์ฟเวอร์, 4002 = error, 4010 = devMode)
export const KICK = { duplicateTab: 4100, roomClosed: 4101, spam: 4110 } as const;

export type ChatMessage = { id: string; sessionId?: string; name: string; text: string; at: number; system?: boolean };

// ขนาดแผนที่ (พิกเซล) และจุดเกิด
export type WorldConfig = { width: number; height: number; spawn: { x: number; y: number }; spread: { x: number; y: number } };

// ห้องพื้นฐานที่มีคนเดินไปมาและแชทได้ ใช้ร่วมกันทั้งเมือง (TownRoom) บ้าน (HomeRoom) และตึก (PlaceRoom)
export abstract class WorldRoom extends Room<WorldState> {
  state = new WorldState();
  protected abstract world: WorldConfig;
  protected abstract joinText(name: string): string;
  private history: ChatMessage[] = [];
  private rate = new Map<string, { start: number; count: number }>();
  private kicked = new Set<string>(); // เชิญออกเอง = ไม่ให้ต่อกลับ
  // คนที่เน็ตหลุดและกำลังรอต่อกลับ (ยังไม่อยู่ใน this.clients แต่ตัวละครยังยืนอยู่)
  private pending = new Map<string, { userId: string; deferred: ReturnType<Room['allowReconnection']> }>();

  // ยกเลิกการรอต่อกลับของคนที่เข้าเงื่อนไข (เช่น เปิดแท็บใหม่แล้ว หรือบ้านถูกปิด)
  protected cancelReconnects(match: (userId: string) => boolean) {
    for (const { userId, deferred } of this.pending.values()) {
      if (match(userId)) deferred.reject(new Error('cancelled'));
    }
  }

  protected kickUser(match: (userId: string) => boolean, code: number, except?: Client) {
    for (const c of this.clients) {
      if (c !== except && match((c.auth as PlayerIdentity | undefined)?.userId ?? '')) this.kick(c, code);
    }
    this.cancelReconnects(match);
  }

  // ตรวจทุกข้อความก่อนทำงาน: ส่งถี่ผิดปกติ = ทิ้ง, ถี่มาก = เตะออก
  protected allow(client: Client) {
    const now = Date.now();
    const r = this.rate.get(client.sessionId);
    if (!r || now - r.start >= 1000) {
      this.rate.set(client.sessionId, { start: now, count: 1 });
      return true;
    }
    r.count++;
    if (r.count > MSG_HARD_LIMIT) this.kick(client, KICK.spam);
    return r.count <= MSG_SOFT_LIMIT;
  }

  protected kick(client: Client, code: number) {
    this.kicked.add(client.sessionId);
    client.leave(code);
  }

  protected registerWorldHandlers() {
    this.onMessage('move', (client, m: { x?: unknown; y?: unknown; dir?: unknown; moving?: unknown }) => {
      if (!this.allow(client)) return;
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof m !== 'object' || m === null) return;
      const { x, y, dir, moving } = m;
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
      if (typeof dir !== 'string' || !DIRS.has(dir)) return;

      // กันวาร์ป/เดินเร็วเกิน: ระยะที่เดินได้สะสมตามเวลาจริง ส่งข้อความถี่แค่ไหนก็ไม่ได้ระยะเพิ่ม
      const now = Date.now();
      p.moveBudget = Math.min(p.moveBudget + (SPEED * MOVE_SLACK * (now - p.lastMoveAt)) / 1000, MOVE_BUDGET_CAP);
      p.lastMoveAt = now;
      const dist = Math.hypot(x - p.x, y - p.y);
      if (dist > p.moveBudget + 1) {
        // ไม่รับตำแหน่งนี้ → บอกให้กลับมาที่ตำแหน่งที่เซิร์ฟเวอร์รู้ ไม่งั้นจะเพี้ยนไปเรื่อยๆ (เช่น เน็ตค้างนาน)
        client.send('correct', { x: p.x, y: p.y });
        return;
      }
      p.moveBudget -= dist;

      p.x = Math.min(Math.max(x, 0), this.world.width);
      p.y = Math.min(Math.max(y, 0), this.world.height);
      p.dir = dir;
      p.moving = moving === true;
    });

    // สถานะโฟกัสเป็นแค่การแสดงผล (เวลาโฟกัสจริงนับในฐานข้อมูล ดู 003_todos_focus.sql)
    this.onMessage('status', (client, s: { focusing?: unknown }) => {
      if (!this.allow(client)) return;
      const p = this.state.players.get(client.sessionId);
      if (p) p.focusing = s?.focusing === true;
    });

    this.onMessage('chat', (client, raw: unknown) => {
      if (!this.allow(client)) return;
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof raw !== 'string') return;
      const text = raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
      const now = Date.now();
      if (!text || now - p.lastChatAt < CHAT_COOLDOWN_MS) return; // กันสแปม
      p.lastChatAt = now;
      this.pushChat({ id: randomUUID(), sessionId: client.sessionId, name: p.name, text, at: now });
    });
  }

  // จุดเกิด + ระยะสุ่มรอบจุด (ห้องลูกเปลี่ยนได้ เช่น เมืองให้เกิดหน้าประตูตึกที่เพิ่งเดินออกมา)
  protected spawnFor(_options: unknown): { x: number; y: number; spread: { x: number; y: number } } {
    return { ...this.world.spawn, spread: this.world.spread };
  }

  onJoin(client: Client, options: unknown, auth: PlayerIdentity) {
    // เปิดซ้ำหลายแท็บ/รีเฟรช: เตะตัวเก่าออก และยกเลิกตัวที่รอต่อกลับอยู่ จะได้ไม่มีตัวละครซ้อนกัน
    this.kickUser((id) => id === auth.userId, KICK.duplicateTab, client);

    const { spread, ...spawn } = this.spawnFor(options);
    const p = new Player();
    p.userId = auth.userId;
    p.name = auth.username;
    p.avatar = auth.avatar;
    p.x = spawn.x + (Math.random() - 0.5) * spread.x;
    p.y = spawn.y + (Math.random() - 0.5) * spread.y;
    p.lastMoveAt = Date.now();
    this.state.players.set(client.sessionId, p);

    client.send('history', this.history);
    this.pushChat({ id: randomUUID(), name: '', text: this.joinText(auth.username), at: Date.now(), system: true });
  }

  async onLeave(client: Client, consented?: boolean) {
    // เน็ตหลุดเอง (ไม่ได้กดออก ไม่ได้ถูกเชิญออก): รอให้ต่อกลับ ตัวละครยืนรออยู่ที่เดิม
    if (!consented && !this.kicked.has(client.sessionId)) {
      const userId = (client.auth as PlayerIdentity | undefined)?.userId ?? '';
      const deferred = this.allowReconnection(client, RECONNECT_SECONDS);
      this.pending.set(client.sessionId, { userId, deferred });
      try {
        const back = await deferred;
        this.pending.delete(client.sessionId);
        // ต่อกลับได้: ถ้าระหว่างหลุดเปิดอีกแท็บไว้ ให้ตัวที่เพิ่งต่อกลับเป็นตัวเดียว
        this.kickUser((id) => id === userId, KICK.duplicateTab, back);
        return;
      } catch {
        // หมดเวลา หรือถูกยกเลิก ถือว่าออกไปแล้ว
      }
      this.pending.delete(client.sessionId);
    }
    this.kicked.delete(client.sessionId);
    this.rate.delete(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (p) this.pushChat({ id: randomUUID(), name: '', text: `${p.name} ออกไปแล้ว`, at: Date.now(), system: true });
  }

  private pushChat(msg: ChatMessage) {
    this.history.push(msg);
    if (this.history.length > HISTORY_SIZE) this.history.shift();
    this.broadcast('chat', msg);
  }
}
