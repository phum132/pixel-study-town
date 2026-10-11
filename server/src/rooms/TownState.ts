import { MapSchema, Schema, type } from '@colyseus/schema';

// ข้อมูลที่ซิงก์ไปให้ทุกคนในห้องอัตโนมัติ
export class Player extends Schema {
  @type('string') name = '';
  @type('string') avatar = '{}'; // JSON สีตัวละคร
  @type('number') x = 0;
  @type('number') y = 0;
  @type('string') dir = 'down'; // down | up | left | right
  @type('boolean') moving = false;

  // ค่าที่ไม่มี @type อยู่แค่ในเซิร์ฟเวอร์ ไม่ส่งให้ใคร
  userId = '';
  lastMoveAt = 0;
  lastChatAt = 0;
}

export class TownState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
