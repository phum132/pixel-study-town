import type { Client } from 'colyseus';
import { identify } from '../supabase.js';
import { COMMUNITY_IDS, MAX_PLAYERS_PER_ROOM } from '../communities.js';
import { WorldRoom } from './WorldRoom.js';

// ตึกสาธารณะในเมือง (ต้องตรงกับ client/src/lib/places.ts)
export const PLACE_IDS = ['library', 'shrine', 'cafe', 'ramen'] as const;
const PLACE_NAMES: Record<string, string> = { library: 'ห้องสมุด', shrine: 'ห้องสมาธิ', cafe: 'คาเฟ่', ramen: 'ร้านราเมน' };

// ห้องในตึกสาธารณะ: คนในคอมมูเดียวกันที่เข้าตึกเดียวกันจะอยู่ห้องเดียวกัน แต่งไว้แล้ว ไม่มีใครแก้ได้
export class PlaceRoom extends WorldRoom {
  maxClients = MAX_PLAYERS_PER_ROOM;
  // ขนาดเดียวกับบ้าน (12x9 ช่อง เกิดที่หน้าประตูด้านล่าง)
  protected world = { width: 12 * 16, height: 9 * 16, spawn: { x: 6 * 16, y: 8 * 16 + 4 }, spread: { x: 16, y: 0 } };
  private placeName = '';

  onCreate(options: { place?: string; community?: string }) {
    this.placeName = PLACE_NAMES[options.place ?? ''] ?? '';
    this.setMetadata({ place: options.place, community: options.community });
    this.registerWorldHandlers();
  }

  async onAuth(_client: Client, options: { token?: string; place?: string; community?: string }) {
    if (!PLACE_IDS.includes(options.place as never)) throw new Error('ไม่มีตึกนี้');
    if (!COMMUNITY_IDS.includes(options.community as never)) throw new Error('ไม่มีคอมมูนี้');
    return identify(options.token);
  }

  protected joinText(name: string) {
    return `${name} เข้ามาใน${this.placeName}`;
  }
}
