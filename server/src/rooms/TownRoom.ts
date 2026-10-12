import type { Client } from 'colyseus';
import { identify } from '../supabase.js';
import { COMMUNITY_IDS, MAX_PLAYERS_PER_ROOM } from '../communities.js';
import { WorldRoom } from './WorldRoom.js';

// เดินออกจากตึก/บ้าน → เกิดหน้าประตูนั้น (ช่องใต้ประตู 1-2 ช่อง ต้องไม่ทับกรอบประตูใน town.json จะได้ไม่เด้งกลับเข้าไป)
// ตัวเลขต้องตรงกับตำแหน่งตึกใน client/tools/make-town-map.mjs
const EXITS: Record<string, { x: number; y: number }> = {
  library: { x: 13 * 16 + 8, y: 12 * 16 + 8 },
  shrine: { x: 21 * 16 + 8, y: 13 * 16 + 8 },
  cafe: { x: 42 * 16 + 8, y: 13 * 16 + 8 },
  ramen: { x: 49 * 16 + 8, y: 13 * 16 + 8 },
  home: { x: 7 * 16 + 8, y: 32 * 16 + 8 },
  math: { x: 28 * 16, y: 27 * 16 + 8 }, // ใต้ประตูด่านคณิต (ช่อง 27-28, 25-26)
};

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

  // รับแค่ชื่อจุด (from) แล้วแปลงเป็นพิกัดเอง ผู้เล่นเลือกพิกัดเกิดเองไม่ได้
  protected spawnFor(options: unknown) {
    const from = (options as { from?: unknown } | undefined)?.from;
    if (typeof from === 'string' && Object.hasOwn(EXITS, from)) return { ...EXITS[from], spread: { x: 8, y: 0 } };
    return super.spawnFor(options);
  }

  protected joinText(name: string) {
    return `${name} เข้ามาในเมือง`;
  }
}
