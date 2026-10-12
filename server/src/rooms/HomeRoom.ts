import type { Client } from 'colyseus';
import { identify, isRoomVisitable, type PlayerIdentity } from '../supabase.js';
import { KICK, WorldRoom } from './WorldRoom.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPDATE_COOLDOWN_MS = 3000; // เจ้าของกดบันทึกรัวๆ ไม่ได้ (ทุกครั้งคนในบ้านต้องโหลดห้องใหม่)

// บ้านของผู้เล่นหนึ่งคน: เจ้าของกับเพื่อนที่มาส่องเห็นกันและคุยกันได้
export class HomeRoom extends WorldRoom {
  maxClients = 20;
  // ต้องตรงกับขนาดห้องในฝั่งเกม (12x9 ช่อง เกิดที่หน้าประตูด้านล่าง)
  protected world = { width: 12 * 16, height: 9 * 16, spawn: { x: 6 * 16, y: 8 * 16 + 4 }, spread: { x: 16, y: 0 } };
  private ownerId = '';
  private lastUpdateAt = 0;

  onCreate(options: { owner?: string }) {
    this.ownerId = options.owner ?? '';
    this.setMetadata({ owner: this.ownerId });
    this.registerWorldHandlers();

    // เจ้าของบ้านกดบันทึกการแต่งห้อง → บอกทุกคนในห้องให้โหลดห้องใหม่
    this.onMessage('room-updated', async (client) => {
      if (!this.allow(client)) return;
      if ((client.auth as PlayerIdentity).userId !== this.ownerId) return;
      // cooldown กันแค่การสั่งทุกคนโหลดห้องใหม่ ส่วนการเช็กว่าปิดบ้านต้องทำทุกครั้ง (allow() คุมความถี่ไว้แล้ว)
      const now = Date.now();
      if (now - this.lastUpdateAt >= UPDATE_COOLDOWN_MS) {
        this.lastUpdateAt = now;
        this.broadcast('reload');
      }
      // เจ้าของเพิ่งปิดบ้าน → เชิญคนอื่นออก รวมถึงคนที่หลุดอยู่และรอต่อกลับ
      if (!(await isRoomVisitable(this.ownerId))) this.kickUser((id) => id !== this.ownerId, KICK.roomClosed);
    });
  }

  async onAuth(_client: Client, options: { token?: string; owner?: string }) {
    // เช็กกับเจ้าของจริงของห้องนี้ (this.ownerId) ไม่ใช่ค่าที่ผู้เล่นส่งมา
    if (typeof options.owner !== 'string' || !UUID.test(options.owner) || options.owner !== this.ownerId) {
      throw new Error('ไม่พบบ้านนี้');
    }
    const me = await identify(options.token);
    if (me.userId !== this.ownerId && !(await isRoomVisitable(this.ownerId))) {
      throw new Error('เจ้าของบ้านปิดห้องไว้ ยังเข้าไปส่องไม่ได้');
    }
    return me;
  }

  protected joinText(name: string) {
    return `${name} เข้ามาในบ้าน`;
  }
}
