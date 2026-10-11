import { supabase } from './supabase';
import { DEFAULT_COLORS, type CharacterColors } from '../game/character';

export type Profile = {
  id: string;
  username: string;
  avatar: CharacterColors;
  xp: number;
  coins: number;
};

export const USERNAME_RULE = /^[A-Za-z0-9_฀-๿]{3,16}$/;

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar, xp, coins')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, avatar: { ...DEFAULT_COLORS, ...data.avatar } };
}

// สร้างใหม่ถ้ายังไม่มี หรืออัปเดตชื่อ/หน้าตาถ้ามีแล้ว
export async function saveProfile(userId: string, username: string, avatar: CharacterColors, isNew: boolean) {
  const query = isNew
    ? supabase.from('profiles').insert({ id: userId, username, avatar })
    : supabase.from('profiles').update({ username, avatar }).eq('id', userId);
  const { error } = await query;
  if (!error) return;
  if (error.code === '23505') throw new Error('ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่นนะ');
  if (error.code === '23514') throw new Error('ชื่อต้องยาว 3-16 ตัว ใช้ได้แค่ภาษาไทย อังกฤษ ตัวเลข และ _');
  throw error;
}
