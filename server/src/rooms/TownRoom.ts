import type { Client } from 'colyseus';
import { identify } from '../supabase.js';
import { COMMUNITY_IDS, MAX_PLAYERS_PER_ROOM } from '../communities.js';
import { WorldRoom } from './WorldRoom.js';

// หนึ่งห้อง = เมืองของหนึ่งคอมมู (คนเกิน 50 จะเปิดห้องใหม่ของคอมมูเดิมให้อัตโนมัติ)
export class TownRoom extends WorldRoom {
  maxClients = MAX_PLAYERS_PER_ROOM;
  // ต้องตรงกับแผนที่ town.json (40x30 ช่อง ช่องละ 16px)
  protected world = { width: 40 * 16, height: 30 * 16, spawn: { x: 19.5 * 16, y: 16 * 16 }, spread: { x: 48, y: 24 } };

  onCreate(options: { community?: string }) {
    this.setMetadata({ community: options.community });
    this.registerWorldHandlers();
  }

  async onAuth(_client: Client, options: { token?: string; community?: string }) {
    if (!COMMUNITY_IDS.includes(options.community as never)) throw new Error('ไม่มีคอมมูนี้');
    return identify(options.token);
  }

  protected joinText(name: string) {
    return `${name} เข้ามาในเมือง`;
  }
}
