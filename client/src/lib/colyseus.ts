import { Client } from 'colyseus.js';

// ค่าเริ่มต้น: เซิร์ฟเวอร์เกมอยู่เครื่องเดียวกับหน้าเว็บที่ port 2567 (มือถือใน WiFi เดียวกันก็ใช้ได้)
// ตอนเอาขึ้นเว็บจริงให้ตั้ง VITE_SERVER_URL ใน .env
const wsUrl =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;

export const gameClient = new Client(wsUrl);
export const serverHttpUrl = wsUrl.replace(/^ws/, 'http');

// ข้อความแชทที่เซิร์ฟเวอร์ส่งมา (ต้องตรงกับ ChatMessage ใน server/src/rooms/TownRoom.ts)
export type ChatMessage = { id: string; sessionId?: string; name: string; text: string; at: number; system?: boolean };

export async function fetchOnlineCounts(): Promise<Record<string, number>> {
  const res = await fetch(`${serverHttpUrl}/communities`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
