import { supabase } from './supabase';
import { SKILL_BY_ID, type SkillDef } from './skills';
import { notifyWallet } from './wallet';
import type { Inventory } from './shop';

// กาชา: ฐานข้อมูลเป็นคนสุ่ม (supabase/migrations/010_arena_maps_gacha.sql) ราคาและอัตราต้องตรงกัน
export const GACHA_PRICE = { 1: 100, 10: 900 } as const;
export const GACHA_RATES = [
  { name: 'เศษพลัง', emoji: '💠', rate: 70, desc: 'เพิ่มค่าตัวถาวรทีละนิด สะสมได้ชนิดละ 20 ขั้น' },
  { name: 'การ์ดสกิล', emoji: '🃏', rate: 25, desc: 'เลือกเป็นสกิลเริ่มต้นเพิ่มในสนามรบ ได้ซ้ำ = การ์ดขั้นสูงขึ้น (สูงสุด 3)' },
  { name: 'การ์ดสกิลผสม', emoji: '🌟', rate: 5, desc: 'สกิลผสมระดับตำนาน เริ่มรอบมาก็มีเลย' },
];

// เศษพลัง: ขั้นละเท่าไร (ต้องตรงกับชื่อใน gacha_roll)
export type Shard = 'dmg' | 'hp' | 'speed' | 'haste' | 'magnet';
export const SHARDS: Record<Shard, { name: string; emoji: string; per: number; unit: string }> = {
  dmg: { name: 'เศษพลังโจมตี', emoji: '🔴', per: 2, unit: '% แรงขึ้น' },
  hp: { name: 'เศษพลังชีวิต', emoji: '💚', per: 5, unit: ' เลือดสูงสุด' },
  speed: { name: 'เศษพลังลม', emoji: '🔵', per: 1.5, unit: '% เดินเร็วขึ้น' },
  haste: { name: 'เศษพลังเวลา', emoji: '🟡', per: 2, unit: '% ใช้สกิลถี่ขึ้น' },
  magnet: { name: 'เศษพลังแม่เหล็ก', emoji: '🟣', per: 3, unit: '% ดูดของไกลขึ้น' },
};
export const SHARD_IDS = Object.keys(SHARDS) as Shard[];
export type Shards = Record<Shard, number>;
export const shardsOf = (inv: Inventory): Shards => Object.fromEntries(SHARD_IDS.map((s) => [s, inv.get(`g:${s}`) ?? 0])) as Shards;
export const shardText = (s: Shard, lv: number) => `+${Math.round(SHARDS[s].per * lv * 10) / 10}${SHARDS[s].unit}`;

// การ์ดสกิลที่มี (เรียงสกิลผสมก่อน แล้วตามขั้น)
export type Card = { def: SkillDef; level: number };
export function cardsOf(inv: Inventory): Card[] {
  const out: Card[] = [];
  for (const [item, level] of inv) {
    if (!item.startsWith('card:')) continue;
    const def = SKILL_BY_ID.get(item.slice(5));
    if (def) out.push({ def, level });
  }
  return out.sort((a, b) => Number(b.def.fused) - Number(a.def.fused) || b.level - a.level || a.def.name.localeCompare(b.def.name));
}

export type PullResult = { item: string; level: number; refund: number };
export async function pull(count: 1 | 10) {
  const { data, error } = await supabase.rpc('gacha_pull', { p_count: count });
  if (error) throw error;
  notifyWallet();
  return data as { results: PullResult[]; coins: number };
}

// แปลงผลกาชาเป็นข้อความ/ระดับสำหรับแสดงการ์ด
export function describePull(r: PullResult): { emoji: string; name: string; sub: string; tier: 'shard' | 'card' | 'legend' } {
  if (r.item.startsWith('g:')) {
    const s = r.item.slice(2) as Shard;
    const d = SHARDS[s];
    return { emoji: d?.emoji ?? '💠', name: d?.name ?? r.item, sub: r.refund ? `เต็มแล้ว คืน ${r.refund} 🪙` : `ขั้น ${r.level} (${shardText(s, r.level)})`, tier: 'shard' };
  }
  const def = SKILL_BY_ID.get(r.item.slice(5));
  return {
    emoji: def?.emoji ?? '🃏',
    name: def?.name ?? r.item,
    sub: r.refund ? `การ์ดเต็มแล้ว คืน ${r.refund} 🪙` : r.level > 1 ? `การ์ดขั้น ${r.level}` : 'การ์ดใหม่!',
    tier: def?.fused ? 'legend' : 'card',
  };
}
