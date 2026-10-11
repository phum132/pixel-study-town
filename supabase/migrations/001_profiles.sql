-- Phase 2: โปรไฟล์ผู้เล่น
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- ชื่อ 3-16 ตัว: อังกฤษ ตัวเลข _ หรือภาษาไทย
  username text not null check (username ~ '^[A-Za-z0-9_฀-๿]{3,16}$'),
  -- สีตัวละคร เช่น {"hair":"#6b3f2a","skin":"#f2c79b","shirt":"#4f8fd1","pants":"#3d4a6b"}
  avatar jsonb not null default '{}'::jsonb
    check (jsonb_typeof(avatar) = 'object' and length(avatar::text) < 300),
  xp integer not null default 0,
  coins integer not null default 0,
  created_at timestamptz not null default now()
);

-- ห้ามชื่อซ้ำ (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
create unique index profiles_username_lower on public.profiles (lower(username));

-- Row Level Security: กฎว่าใครทำอะไรกับแถวไหนได้
alter table public.profiles enable row level security;

create policy "ทุกคนดูโปรไฟล์ได้"
  on public.profiles for select
  using (true);

create policy "สร้างได้เฉพาะโปรไฟล์ของตัวเอง"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "แก้ได้เฉพาะโปรไฟล์ของตัวเอง"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ผู้เล่นแก้ได้แค่ชื่อกับหน้าตา ส่วน xp/coins ให้เซิร์ฟเวอร์เป็นคนแก้เท่านั้น (กันโกง)
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username, avatar) on public.profiles to authenticated;
grant update (username, avatar) on public.profiles to authenticated;
