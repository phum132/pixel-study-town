import type { Client } from 'colyseus';
import { identify, isRoomVisitable, type PlayerIdentity } from '../supabase.js';
import { WorldRoom } from './WorldRoom.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// บ้านของผู้เล่นหนึ่งคน: เจ้าของกับเพื่อนที่มาส่องเห็นกันและคุยกันได้
export class HomeRoom extends WorldRoom {
  maxClients = 20;
  // ต้องตรงกับขนาดห้องในฝั่งเกม (12x9 ช่อง เกิดที่หน้าประตูด้านล่าง)
  protected world = { width: 12 * 16, height: 9 * 16, spawn: { x: 6 * 16, y: 8 * 16 + 4 }, spread: { x: 16, y: 0 } };
  private ownerId = '';

  onCreate(options: { owner?: string }) {
    this.ownerId = options.owner ?? '';
    this.setMetadata({ owner: this.ownerId });
    this.registerWorldHandlers();

    // เจ้าของบ้านกดบันทึกการแต่งห้อง → บอกทุกคนในห้องให้โหลดห้องใหม่
    this.onMessage('room-updated', (client) => {
      if ((client.auth as PlayerIdentity).userId === this.ownerId) this.broadcast('reload');
    });
  }

  async onAuth(_client: Client, options: { token?: string; owner?: string }) {
    if (typeof options.owner !== 'string' || !UUID.test(options.owner)) throw new Error('ไม่พบบ้านนี้');
    const me = await identify(options.token);
    if (me.userId !== options.owner && !(await isRoomVisitable(options.owner))) {
      throw new Error('เจ้าของบ้านปิดห้องไว้ ยังเข้าไปส่องไม่ได้');
    }
    return me;
  }

  protected joinText(name: string) {
    return `${name} เข้ามาในบ้าน`;
  }
}
