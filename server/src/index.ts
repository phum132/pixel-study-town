import 'dotenv/config';
import { createServer } from 'node:http';
import { Server, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TownRoom } from './rooms/TownRoom.js';
import { COMMUNITY_IDS } from './communities.js';

const port = Number(process.env.PORT ?? 2567);

// GET /communities → จำนวนคนออนไลน์ในแต่ละคอมมู (หน้าเลือกคอมมูใช้แสดงผล)
const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET' && req.url === '/communities') {
    const rooms = await matchMaker.query({ name: 'town' });
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

await gameServer.listen(port);
console.log(`🏘️  เซิร์ฟเวอร์เกมพร้อมแล้ว ws://localhost:${port}`);
