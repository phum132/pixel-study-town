import { randomUUID } from 'node:crypto';
import { Room, type Client } from 'colyseus';
import { identify, type PlayerIdentity } from '../supabase.js';
import { COMMUNITY_IDS, MAX_PLAYERS_PER_ROOM } from '../communities.js';
import { Player, TownState } from './TownState.js';

// ค่าต้องตรงกับแผนที่และความเร็วในฝั่งเกม
const MAP_W = 40 * 16;
const MAP_H = 30 * 16;
const SPAWN = { x: 19.5 * 16, y: 16 * 16 };
const SPEED = 80;
const DIRS = new Set(['down', 'up', 'left', 'right']);
const CHAT_MAX_LENGTH = 200;
const CHAT_COOLDOWN_MS = 800;
const HISTORY_SIZE = 30;

export type ChatMessage = { id: string; sessionId?: string; name: string; text: string; at: number; system?: boolean };

// หนึ่งห้อง = เมืองของหนึ่งคอมมู (คนเกิน 50 จะเปิดห้องใหม่ของคอมมูเดิมให้อัตโนมัติ)
export class TownRoom extends Room<TownState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  state = new TownState();
  private history: ChatMessage[] = [];

  onCreate(options: { community?: string }) {
    this.setMetadata({ community: options.community });

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

      p.x = Math.min(Math.max(x, 0), MAP_W);
      p.y = Math.min(Math.max(y, 0), MAP_H);
      p.dir = dir;
      p.moving = moving === true;
      p.lastMoveAt = now;
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

  async onAuth(_client: Client, options: { token?: string; community?: string }) {
    if (!COMMUNITY_IDS.includes(options.community as never)) throw new Error('ไม่มีคอมมูนี้');
    return identify(options.token);
  }

  onJoin(client: Client, _options: unknown, auth: PlayerIdentity) {
    // เปิดซ้ำหลายแท็บ: เตะตัวเก่าออก จะได้ไม่มีตัวละครซ้อนกัน
    for (const other of this.clients) {
      if (other !== client && (other.auth as PlayerIdentity | undefined)?.userId === auth.userId) other.leave(4000);
    }

    const p = new Player();
    p.userId = auth.userId;
    p.name = auth.username;
    p.avatar = auth.avatar;
    p.x = SPAWN.x + (Math.random() - 0.5) * 48;
    p.y = SPAWN.y + (Math.random() - 0.5) * 24;
    p.lastMoveAt = Date.now();
    this.state.players.set(client.sessionId, p);

    client.send('history', this.history);
    this.pushChat({ id: randomUUID(), name: '', text: `${auth.username} เข้ามาในเมือง`, at: Date.now(), system: true });
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
