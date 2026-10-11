import { createClient } from '@supabase/supabase-js';

// ค่าพวกนี้อ่านจากไฟล์ client/.env (ดูตัวอย่างใน .env.example)
// คีย์นี้เป็นคีย์สาธารณะ ใส่ในหน้าเว็บได้ ความปลอดภัยมาจากกฎ RLS ในฐานข้อมูล
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key');
