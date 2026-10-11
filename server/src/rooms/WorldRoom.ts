import { randomUUID } from 'node:crypto';
import { Room, type Client } from 'colyseus';
import type { PlayerIdentity } from '../supabase.js';
import { Player, WorldState } from './WorldState.js';

const SPEED = 80; // ต้องตรงกับความเร็วในฝั่งเกม
const DIRS = new Set(['down', 'up', 'left', 'right']);
const CHAT_MAX_LENGTH = 200;
const CHAT_COOLDOWN_MS = 800;
const HISTORY_SIZE = 30;

export type ChatMessage = { id: string; sessionId?: string; name: string; text: string; at: number; system?: boolean };

// ขนาดแผนที่ (พิกเซล) และจุดเกิด
export type WorldConfig = { width: number; height: number; spawn: { x: number; y: number }; spread: { x: number; y: number } };

// ห้องพื้นฐานที่มีคนเดินไปมาและแชทได้ ทั้งเมือง (TownRoom) และบ้าน (HomeRoom) ใช้ร่วมกัน
export abstract class WorldRoom extends Room<WorldState> {
  state = new WorldState();
  protected abstract world: WorldConfig;
  protected abstract joinText(name: string): string;
  private history: ChatMessage[] = [];

  protected registerWorldHandlers() {
    this.onMessage('move', (client, m: { x?: unknown; y?: unknown; dir?: unknown; moving?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof m !== 'object' || m === null) return;
      const { x, y, dir, moving } = m;
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
      if (typeof dir !== 'string' || !DIRS.has(dir)) return;

      // กันวาร์ป: ถ้าเดินไกลเกินกว่าที่ความเร็วปกติทำได้ จะไม่รับตำแหน่งนี้
      const now = Date.now();
      const elapsed = Math.max((now - p.lastMoveAt) / 1000, 0.05);
      const maxDistance = SPEED * elapsed * 1.5 + 4;
      if (Math.hypot(x - p.x, y - p.y) > maxDistance) return;

      p.x = Math.min(Math.max(x, 0), this.world.width);
      p.y = Math.min(Math.max(y, 0), this.world.height);
      p.dir = dir;
      p.moving = moving === true;
      p.lastMoveAt = now;
    });

    // สถานะโฟกัสเป็นแค่การแสดงผล (เวลาโฟกัสจริงนับในฐานข้อมูล ดู 003_todos_focus.sql)
    this.onMessage('status', (client, s: { focusing?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.focusing = s?.focusing === true;
    });

    this.onMessage('chat', (client, raw: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof raw !== 'string') return;
      const text = raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
      const now = Date.now();
      if (!text || now - p.lastChatAt < CHAT_COOLDOWN_MS) return; // กันสแปม
      p.lastChatAt = now;
      this.pushChat({ id: randomUUID(), sessionId: client.sessionId, name: p.name, text, at: now });
    });
  }

  onJoin(client: Client, _options: unknown, auth: PlayerIdentity) {
    // เปิดซ้ำหลายแท็บ: เตะตัวเก่าออก จะได้ไม่มีตัวละครซ้อนกัน
    for (const other of this.clients) {
      if (other !== client && (other.auth as PlayerIdentity | undefined)?.userId === auth.userId) other.leave(4000);
    }

    const { spawn, spread } = this.world;
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

  onLeave(client: Client) {
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
