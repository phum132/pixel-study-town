-- Phase 5: To-do และเวลาโฟกัส (Pomodoro)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run

-- ================= To-do =================
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 120),
  done boolean not null default false,
  done_at timestamptz, -- ฐานข้อมูลใส่เวลาให้เอง (ใช้นับ XP ใน Phase 8)
  is_public boolean not null default true, -- true = คนที่มาส่องบ้านเห็นงานนี้
  created_at timestamptz not null default now()
);

create index todos_owner on public.todos (owner_id, created_at);

alter table public.todos enable row level security;

create policy "ดูงานของตัวเอง หรืองานที่เปิดสาธารณะ"
  on public.todos for select
  using (owner_id = auth.uid() or is_public);

create policy "เพิ่มงานให้ตัวเองเท่านั้น"
  on public.todos for insert to authenticated
  with check (owner_id = auth.uid());

create policy "แก้งานของตัวเองเท่านั้น"
  on public.todos for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "ลบงานของตัวเองเท่านั้น"
  on public.todos for delete to authenticated
  using (owner_id = auth.uid());

revoke insert, update on public.todos from anon, authenticated;
grant insert (text, is_public) on public.todos to authenticated;
grant update (text, done, is_public) on public.todos to authenticated;

-- ใส่เวลาทำเสร็จด้วยนาฬิกาของฐานข้อมูล (แก้เวลาจากเบราว์เซอร์ไม่ได้) และจำกัดไม่เกิน 100 งานต่อคน
create function public.todos_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.todos where owner_id = new.owner_id) >= 100 then
      raise exception 'มีงานได้สูงสุด 100 งาน ลบงานเก่าก่อนนะ';
    end if;
    new.done_at := case when new.done then now() end;
  elsif new.done is distinct from old.done then
    new.done_at := case when new.done then now() end;
  else
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;

create trigger todos_before_write before insert or update on public.todos
  for each row execute function public.todos_before_write();

-- ================= เวลาโฟกัส =================
-- ผู้เล่นแก้ตารางนี้ตรงๆ ไม่ได้ ต้องผ่านฟังก์ชัน start_focus / finish_focus ด้านล่างเท่านั้น
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  planned_minutes integer not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes integer not null default 0, -- นาทีที่นับจริง (ไม่เกินที่ตั้งไว้)
  completed boolean not null default false -- true = อยู่ครบเวลา
);

-- เปิดรอบโฟกัสค้างไว้ได้ทีละ 1 รอบต่อคน
create unique index focus_one_open on public.focus_sessions (user_id) where ended_at is null;
create index focus_user_time on public.focus_sessions (user_id, started_at);

alter table public.focus_sessions enable row level security;

create policy "ดูประวัติโฟกัสของตัวเอง"
  on public.focus_sessions for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.focus_sessions from anon, authenticated;

-- ปิดรอบที่เปิดค้างอยู่ คิดนาทีจากนาฬิกาฐานข้อมูล
create function public.close_open_focus(uid uuid) returns public.focus_sessions
language plpgsql security definer set search_path = public as $$
declare
  s focus_sessions;
  elapsed integer;
begin
  select * into s from focus_sessions where user_id = uid and ended_at is null for update;
  if not found then return null; end if;
  elapsed := floor(extract(epoch from now() - s.started_at) / 60);
  update focus_sessions
     set ended_at = now(),
         minutes = least(elapsed, s.planned_minutes),
         completed = now() - s.started_at >= make_interval(mins => s.planned_minutes) - interval '5 seconds'
   where id = s.id
  returning * into s;
  return s;
end;
$$;

revoke execute on function public.close_open_focus(uuid) from public, anon, authenticated;

-- เริ่มรอบใหม่ (ถ้ามีรอบค้างอยู่จะถูกปิดก่อน)
create function public.start_focus(planned integer) returns json
language plpgsql security definer set search_path = public as $$
declare
  s focus_sessions;
begin
  if auth.uid() is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  if planned not in (1, 15, 25, 50) then raise exception 'เลือกได้ 15, 25 หรือ 50 นาที'; end if;
  perform close_open_focus(auth.uid());
  insert into focus_sessions (user_id, planned_minutes) values (auth.uid(), planned) returning * into s;
  return json_build_object('started_at', s.started_at, 'planned_minutes', s.planned_minutes, 'now', now());
end;
$$;

-- จบรอบ (ครบเวลา หรือกดหยุดก่อนก็ได้) คืนค่านาทีที่ได้
create function public.finish_focus() returns json
language plpgsql security definer set search_path = public as $$
declare
  s focus_sessions;
begin
  if auth.uid() is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  s := close_open_focus(auth.uid());
  if s.id is null then return null; end if;
  return json_build_object('minutes', s.minutes, 'completed', s.completed);
end;
$$;

-- รอบที่เปิดอยู่ตอนนี้ (ไว้นับเวลาต่อหลังรีเฟรชหน้าเว็บ)
create function public.current_focus() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('started_at', started_at, 'planned_minutes', planned_minutes, 'now', now())
    from focus_sessions where user_id = auth.uid() and ended_at is null;
$$;

revoke execute on function public.start_focus(integer), public.finish_focus(), public.current_focus() from public, anon;
grant execute on function public.start_focus(integer), public.finish_focus(), public.current_focus() to authenticated;
