import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) throw new Error('ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_KEY ใน server/.env');

export const supabase = createClient(url, key, { auth: { persistSession: false } });

export type PlayerIdentity = { userId: string; username: string; avatar: string };

// ตรวจ token ที่ผู้เล่นส่งมา แล้วดึงชื่อ/หน้าตาจากฐานข้อมูลเอง (ไม่เชื่อชื่อที่เบราว์เซอร์ส่งมา)
export async function identify(token: unknown): Promise<PlayerIdentity> {
  if (typeof token !== 'string' || !token) throw new Error('ต้องล็อกอินก่อน');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('token ไม่ถูกต้องหรือหมดอายุ');

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('username, avatar')
    .eq('id', data.user.id)
    .single();
  if (pErr || !profile) throw new Error('ยังไม่ได้สร้างโปรไฟล์');

  return { userId: data.user.id, username: profile.username, avatar: JSON.stringify(profile.avatar ?? {}) };
}
