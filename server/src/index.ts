import 'dotenv/config';
import { createServer } from 'node:http';
import { Server, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TownRoom } from './rooms/TownRoom.js';
import { HomeRoom } from './rooms/HomeRoom.js';
import { PlaceRoom } from './rooms/PlaceRoom.js';
import { COMMUNITY_IDS } from './communities.js';

const port = Number(process.env.PORT ?? 2567);

// ให้เบราว์เซอร์เรียกได้แค่ "เข้าห้อง (สร้างให้ถ้ายังไม่มี)" กับ "ต่อกลับ"
// ปิด create (เปิดห้องเปล่ารัวๆ ได้) และ joinById (เข้าห้องไหนก็ได้ถ้ารู้รหัส ข้ามการตรวจของ joinOrCreate)
matchMaker.controller.exposedMethods = ['joinOrCreate', 'reconnect'];

// GET /communities → จำนวนคนออนไลน์ในแต่ละคอมมู (นับทั้งในเมืองและในตึกสาธารณะ)
const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET' && req.url === '/communities') {
    const rooms = [...(await matchMaker.query({ name: 'town' })), ...(await matchMaker.query({ name: 'place' }))];
    const online: Record<string, number> = Object.fromEntries(COMMUNITY_IDS.map((id) => [id, 0]));
    for (const r of rooms) {
      const id = r.metadata?.community;
      if (id in online) online[id] += r.clients;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(online));
    return;
  }
  res.statusCode = 404;
  res.end();
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

// คอมมูเดียวกันจะเข้าห้องเดียวกัน (filterBy) จนกว่าห้องจะเต็ม
gameServer.define('town', TownRoom).filterBy(['community']);
// บ้านของใครของมัน: เลือกห้องตามเจ้าของบ้าน
gameServer.define('home', HomeRoom).filterBy(['owner']);
// ตึกสาธารณะ: แยกห้องตามตึกและคอมมู
gameServer.define('place', PlaceRoom).filterBy(['place', 'community']);

await gameServer.listen(port);
console.log(`🏘️  เซิร์ฟเวอร์เกมพร้อมแล้ว ws://localhost:${port}`);
