import type { Client } from 'colyseus';
import { identify } from '../supabase.js';
import { COMMUNITY_IDS, MAX_PLAYERS_PER_ROOM } from '../communities.js';
import { WorldRoom } from './WorldRoom.js';

// หนึ่งห้อง = เมืองของหนึ่งคอมมู (คนเกิน 50 จะเปิดห้องใหม่ของคอมมูเดิมให้อัตโนมัติ)
export class TownRoom extends WorldRoom {
  maxClients = MAX_PLAYERS_PER_ROOM;
  // ต้องตรงกับแผนที่ town.json (64x48 ช่อง ช่องละ 16px, เกิดกลางลานเมือง) ดู client/tools/make-town-map.mjs
  protected world = { width: 64 * 16, height: 48 * 16, spawn: { x: 32 * 16, y: 24 * 16 }, spread: { x: 64, y: 32 } };

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
