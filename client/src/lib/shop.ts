import { supabase } from './supabase';
import { RARITY, SKINS } from './skins';
import { notifyWallet } from './wallet';

// ร้านค้า: ราคาจริงอยู่ในฐานข้อมูล (supabase/migrations/009_shop.sql) ตรงนี้แค่แสดง ต้องตั้งให้ตรงกัน

export type Perk = 'hp' | 'power' | 'magnet' | 'ult' | 'revive';
export const PERKS: Record<Perk, { name: string; emoji: string; max: number; price: (next: number) => number; desc: (lv: number) => string }> = {
  hp: { name: 'ร่างกายแกร่ง', emoji: '❤️', max: 5, price: (n) => 100 * n, desc: (lv) => `เลือดเริ่มต้น +${lv * 10}` },
  power: { name: 'พลังแฝง', emoji: '💪', max: 5, price: (n) => 150 * n, desc: (lv) => `ทุกการโจมตีแรงขึ้น ${lv * 5}%` },
  magnet: { name: 'แม่เหล็กติดตัว', emoji: '🧲', max: 3, price: (n) => 80 * n, desc: (lv) => `ดูดของได้ไกลขึ้น ${lv * 10}%` },
  ult: { name: 'สมาธิแน่วแน่', emoji: '🔮', max: 3, price: (n) => 200 * n, desc: (lv) => `เริ่มรอบด้วยเกจท่าไม้ตาย ${lv * 20}%` },
  revive: { name: 'ขนนกฟีนิกซ์', emoji: '🪶', max: 1, price: () => 800, desc: () => 'ตายแล้วฟื้นคืนชีพ 1 ครั้งต่อรอบ (เลือดครึ่งหนึ่ง)' },
};
export const PERK_IDS = Object.keys(PERKS) as Perk[];
export type Perks = Record<Perk, number>;

export const skinPrice = (id: string) => {
  const s = SKINS.find((k) => k.id === id);
  return s ? RARITY[s.rarity].price : 0;
};

export type Inventory = Map<string, number>; // item → ระดับ
export async function fetchInventory(): Promise<Inventory> {
  const { data, error } = await supabase.from('inventory').select('item, level');
  if (error) throw error;
  return new Map((data as { item: string; level: number }[]).map((r) => [r.item, r.level]));
}

export const perksOf = (inv: Inventory): Perks => Object.fromEntries(PERK_IDS.map((p) => [p, inv.get(`up:${p}`) ?? 0])) as Perks;
export const ownsSkin = (inv: Inventory, id: string) => (inv.get(`skin:${id}`) ?? 0) > 0;

export async function buy(item: string) {
  const { data, error } = await supabase.rpc('shop_buy', { p_item: item });
  if (error) throw error;
  notifyWallet(); // เหรียญลด → แอปโหลดกระเป๋าใหม่
  return data as { item: string; level: number; coins: number };
}
