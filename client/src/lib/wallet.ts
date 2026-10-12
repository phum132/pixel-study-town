import { supabase } from './supabase';

// กระเป๋าเหรียญ + XP + แรงค์ (ฐานข้อมูลให้รางวัลเอง ดู supabase/migrations/008_economy.sql)

// แรงค์ตาม XP ทั้งหมดที่เคยได้
export const RANKS = [
  { name: 'Bronze', th: 'ทองแดง', emoji: '🥉', min: 0 },
  { name: 'Silver', th: 'เงิน', emoji: '🥈', min: 300 },
  { name: 'Gold', th: 'ทอง', emoji: '🥇', min: 1000 },
  { name: 'Platinum', th: 'แพลทินัม', emoji: '💠', min: 3000 },
  { name: 'Diamond', th: 'เพชร', emoji: '💎', min: 8000 },
];

export function rankOf(xp: number) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1];
  return { ...RANKS[i], next, progress: next ? (xp - RANKS[i].min) / (next.min - RANKS[i].min) : 1 };
}

// บอกแอปว่าเพิ่งทำอะไรที่อาจได้รางวัล → แอปโหลดโปรไฟล์ใหม่ แล้วขึ้น "+เหรียญ +XP"
export function notifyWallet() {
  window.dispatchEvent(new Event('pst-wallet'));
}

export type WalletEntry = { id: number; source: string; coins: number; xp: number; note: string; created_at: string };
export async function fetchWalletLog(): Promise<WalletEntry[]> {
  const { data, error } = await supabase.from('wallet_log').select('id, source, coins, xp, note, created_at').order('id', { ascending: false }).limit(30);
  if (error) throw error;
  return data as WalletEntry[];
}

export type XpRank = { username: string; character_name: string | null; xp: number };
export async function xpLeaderboard(period: 'week' | 'all'): Promise<XpRank[]> {
  const { data, error } = await supabase.rpc('xp_leaderboard', { p_period: period });
  if (error) throw error;
  return data as XpRank[];
}

// สนามรบ: เริ่ม/จบรอบผ่านฐานข้อมูล (ฐานข้อมูลตัดผลให้ไม่เกินเวลาเล่นจริง และจำกัดเหรียญต่อวัน)
export async function arenaStart(map: number): Promise<string> {
  const { data, error } = await supabase.rpc('arena_start', { p_map: map });
  if (error) throw error;
  return (data as { run_id: string }).run_id;
}

export async function arenaFinish(runId: string, r: { sec: number; kills: number; coins: number; won: boolean }) {
  const { data, error } = await supabase.rpc('arena_finish', { p_run: runId, p_sec: r.sec, p_kills: r.kills, p_coins: r.coins, p_won: r.won });
  if (error) throw error;
  return data as { coins: number; xp: number; capped: boolean; won: boolean };
}
