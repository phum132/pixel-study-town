-- Phase 4: ห้องส่วนตัวของผู้เล่น
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run

create table public.rooms (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  -- ธีม เช่น {"floor":"wood","floorColor":"#b07a4f","wall":"stripe","wallColor":"#e8dcc0"}
  theme jsonb not null default '{}'::jsonb
    check (jsonb_typeof(theme) = 'object' and length(theme::text) < 500),
  -- เฟอร์นิเจอร์ เช่น [{"i":"bed_single_orange","x":1,"y":2}, ...] (จำกัด 100 ชิ้น)
  layout jsonb not null default '[]'::jsonb
    check (jsonb_typeof(layout) = 'array' and jsonb_array_length(layout) <= 100 and length(layout::text) < 8000),
  is_public boolean not null default true, -- false = ไม่ให้คนอื่นเข้ามาส่อง
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy "ดูห้องที่เปิดสาธารณะ หรือห้องของตัวเอง"
  on public.rooms for select
  using (is_public or owner_id = auth.uid());

create policy "สร้างได้เฉพาะห้องของตัวเอง"
  on public.rooms for insert to authenticated
  with check (owner_id = auth.uid());

create policy "แก้ได้เฉพาะห้องของตัวเอง"
  on public.rooms for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke insert, update on public.rooms from anon, authenticated;
grant insert (owner_id, theme, layout, is_public) on public.rooms to authenticated;
grant update (theme, layout, is_public) on public.rooms to authenticated;

-- อัปเดตเวลาแก้ไขล่าสุดให้อัตโนมัติ
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();

-- เซิร์ฟเวอร์เกมใช้เช็กว่าเข้าไปส่องบ้านนี้ได้ไหม (ต้องมีเจ้าของจริง และไม่ได้ปิดห้องไว้)
-- security definer = ฟังก์ชันนี้มองเห็นห้องที่ปิดไว้ได้ แต่ตอบกลับแค่ true/false ไม่เปิดเผยข้อมูลห้อง
create function public.room_is_visitable(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = owner)
     and not exists (select 1 from rooms where owner_id = owner and not is_public);
$$;

grant execute on function public.room_is_visitable(uuid) to anon, authenticated;
