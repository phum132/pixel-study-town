-- Phase 8b: กระเป๋าเหรียญ + XP + แรงค์ (ฐานข้อมูลเป็นคนให้รางวัลเองทั้งหมด)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run (ต้องรัน 003 และ 007 มาก่อน / รันซ้ำได้ไม่พัง)
--
-- หลักการ: ทุกรางวัลจดลง wallet_log หนึ่งแถว (ที่มา + รหัสอ้างอิง) ห้ามซ้ำ จึงรับรางวัลเดิมสองครั้งไม่ได้
-- แล้วค่อยบวกเข้า profiles.xp / profiles.coins (ผู้เล่นแก้สองช่องนี้เองไม่ได้อยู่แล้ว ดู 001_profiles.sql)
--   โฟกัส      1 นาที = 1 XP / ครบรอบ ได้เหรียญ นาที÷5
--   To-do      ทำเสร็จ = 5 XP + 1 เหรียญ (วันละไม่เกิน 20 อัน)
--   ด่านคณิต   ดาวใหม่ทุกดวง = 10 XP + 5 เหรียญ คูณระดับ (ม.ต้น x1, ม.ปลาย x2, มหาลัย x3)
--   สนามรบ     10 วินาที = 1 XP + เหรียญที่เก็บได้ (ตรวจกับเวลาจริง รอบละไม่เกิน 60 วันละไม่เกิน 150) ชนะบอส +20 เหรียญ +50 XP

create table if not exists public.wallet_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('focus', 'todo', 'adv', 'arena', 'shop')),
  ref text not null,
  coins integer not null default 0,
  xp integer not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, source, ref)
);
create index if not exists wallet_log_user_time on public.wallet_log (user_id, created_at desc);
create index if not exists wallet_log_time on public.wallet_log (created_at);

alter table public.wallet_log enable row level security;
drop policy if exists "ดูประวัติกระเป๋าของตัวเอง" on public.wallet_log;
create policy "ดูประวัติกระเป๋าของตัวเอง" on public.wallet_log for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.wallet_log from anon, authenticated;

-- วันที่ตามเวลาไทย (ใช้นับโควตารายวัน)
create or replace function public.th_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

create or replace function public.th_day_start() returns timestamptz
language sql stable as $$ select (th_today()::timestamp) at time zone 'Asia/Bangkok' $$;

-- ให้รางวัล (ภายในเท่านั้น) คืนค่า true ถ้าให้จริง / false ถ้าเคยให้ไปแล้ว
create or replace function public.grant_reward(uid uuid, p_source text, p_ref text, p_coins integer, p_xp integer, p_note text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if uid is null or (coalesce(p_coins, 0) <= 0 and coalesce(p_xp, 0) <= 0) then return false; end if;
  insert into wallet_log (user_id, source, ref, coins, xp, note)
    values (uid, p_source, p_ref, greatest(p_coins, 0), greatest(p_xp, 0), p_note)
    on conflict (user_id, source, ref) do nothing;
  if not found then return false; end if;
  update profiles set coins = coins + greatest(p_coins, 0), xp = xp + greatest(p_xp, 0) where id = uid;
  return true;
end;
$$;

-- ---------- โฟกัส: ให้ตอนปิดรอบ (กดจบเอง หมดเวลา หรือเริ่มรอบใหม่) ----------
create or replace function public.reward_focus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.ended_at is null and new.ended_at is not null and new.minutes > 0 then
    perform grant_reward(new.user_id, 'focus', new.id::text,
      case when new.completed then new.minutes / 5 else 0 end, new.minutes,
      'โฟกัส ' || new.minutes || ' นาที' || case when new.completed then ' (ครบรอบ)' else '' end);
  end if;
  return new;
end;
$$;
drop trigger if exists focus_reward on public.focus_sessions;
create trigger focus_reward after update on public.focus_sessions for each row execute function public.reward_focus();

-- ---------- To-do: ให้ครั้งแรกที่ติ๊กเสร็จ (ติ๊กออกแล้วติ๊กใหม่ไม่ได้อีก) วันละ 20 อัน ----------
create or replace function public.reward_todo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done)
     and (select count(*) from wallet_log where user_id = new.owner_id and source = 'todo' and created_at >= th_day_start()) < 20 then
    perform grant_reward(new.owner_id, 'todo', new.id::text, 1, 5, 'ทำงานเสร็จ: ' || left(new.text, 40));
  end if;
  return new;
end;
$$;
drop trigger if exists todo_reward on public.todos;
create trigger todo_reward after insert or update of done on public.todos for each row execute function public.reward_todo();

-- ---------- ด่านคณิต: ดาวใหม่ทุกดวง (เล่นซ้ำได้ดาวเท่าเดิมไม่ได้อะไรเพิ่ม) ----------
create or replace function public.reward_adv() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w integer := case new.level when 'lower' then 1 when 'upper' then 2 else 3 end;
  lname text := case new.level when 'lower' then 'ม.ต้น' when 'upper' then 'ม.ปลาย' else 'มหาลัย' end;
  from_star integer := case when tg_op = 'INSERT' then 1 else old.stars + 1 end;
begin
  for s in from_star..new.stars loop
    perform grant_reward(new.user_id, 'adv', new.subject || ':' || new.level || ':' || new.stage || ':' || s, 5 * w, 10 * w,
      'ด่านคณิต ' || lname || ' ด่าน ' || new.stage || ' ดาวที่ ' || s);
  end loop;
  return new;
end;
$$;
drop trigger if exists adv_reward on public.adv_best;
create trigger adv_reward after insert or update of stars on public.adv_best for each row execute function public.reward_adv();

-- ---------- สนามรบ ----------
create table if not exists public.arena_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sec integer,
  kills integer,
  won boolean,
  coins integer,
  xp integer
);
create index if not exists arena_runs_user on public.arena_runs (user_id, started_at desc);
alter table public.arena_runs enable row level security;
drop policy if exists "ดูรอบสนามรบของตัวเอง" on public.arena_runs;
create policy "ดูรอบสนามรบของตัวเอง" on public.arena_runs for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.arena_runs from anon, authenticated;

create or replace function public.arena_start() returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  perform pg_advisory_xact_lock(hashtext('arena' || uid::text));
  if (select count(*) from arena_runs where user_id = uid and started_at > now() - interval '10 minutes') >= 15 then
    raise exception 'เริ่มรอบถี่เกินไป พักสักครู่นะ';
  end if;
  delete from arena_runs where user_id = uid and started_at < now() - interval '7 days';
  insert into arena_runs (user_id) values (uid) returning id into rid;
  return json_build_object('run_id', rid);
end;
$$;

-- จบรอบ: เบราว์เซอร์บอกผลมา แต่ฐานข้อมูลตัดให้ไม่เกินที่เป็นไปได้ตามเวลาจริง
create or replace function public.arena_finish(p_run uuid, p_sec integer, p_kills integer, p_coins integer, p_won boolean) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  run arena_runs;
  real_sec integer;
  v_sec integer;
  v_kills integer;
  v_won boolean;
  v_coins integer;
  v_xp integer;
  day_coins integer;
  day_xp integer;
  capped boolean := false;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  select * into run from arena_runs where id = p_run and user_id = uid for update;
  if not found then raise exception 'ไม่พบรอบนี้'; end if;
  if run.finished_at is not null then raise exception 'รอบนี้ส่งผลไปแล้ว'; end if;

  real_sec := floor(extract(epoch from now() - run.started_at));
  v_sec := greatest(0, least(coalesce(p_sec, 0), real_sec + 5, 1800)); -- เล่นนานกว่าเวลาจริงไม่ได้ (หยุดเกมไว้ นับน้อยกว่าเวลาจริงได้)
  v_kills := greatest(0, least(coalesce(p_kills, 0), v_sec * 3)); -- ล้มมอนได้ไม่เกินวินาทีละ 3 ตัว
  v_won := coalesce(p_won, false) and v_sec >= 600;
  -- เหรียญที่เก็บได้จริงไม่น่าเกิน: มอน 1 ใน 8 ตัว + หัวหน้านาทีละ 5 เหรียญ (รอบละไม่เกิน 60)
  v_coins := greatest(0, least(coalesce(p_coins, 0), v_kills / 8 + (v_sec / 60) * 5, 60));
  if v_won then v_coins := v_coins + 20; end if;
  v_xp := v_sec / 10 + case when v_won then 50 else 0 end;

  -- โควตารายวัน (เวลาไทย)
  select coalesce(sum(coins), 0), coalesce(sum(xp), 0) into day_coins, day_xp
    from wallet_log where user_id = uid and source = 'arena' and created_at >= th_day_start();
  if v_coins > 150 - day_coins then v_coins := greatest(0, 150 - day_coins); capped := true; end if;
  if v_xp > 600 - day_xp then v_xp := greatest(0, 600 - day_xp); capped := true; end if;

  update arena_runs set finished_at = now(), sec = v_sec, kills = v_kills, won = v_won, coins = v_coins, xp = v_xp where id = run.id;
  perform grant_reward(uid, 'arena', run.id::text, v_coins, v_xp,
    'สนามรบ ' || (v_sec / 60) || ':' || lpad((v_sec % 60)::text, 2, '0') || case when v_won then ' (ชนะบอส)' else '' end);
  return json_build_object('coins', v_coins, 'xp', v_xp, 'capped', capped, 'won', v_won);
end;
$$;

-- ---------- กระดานอันดับ XP: week = 7 วันล่าสุด / all = ตลอดกาล ----------
create or replace function public.xp_leaderboard(p_period text) returns table (username text, character_name text, xp integer)
language sql stable security definer set search_path = public as $$
  select p.username, p.avatar ->> 'character', p.xp
    from profiles p
   where p_period is distinct from 'week' and p.xp > 0
  union all
  select p.username, p.avatar ->> 'character', sum(w.xp)::integer
    from wallet_log w join profiles p on p.id = w.user_id
   where p_period = 'week' and w.created_at > now() - interval '7 days'
   group by p.id, p.username, p.avatar
  having sum(w.xp) > 0
  order by 3 desc, 1
  limit 20;
$$;

revoke execute on function public.grant_reward(uuid, text, text, integer, integer, text), public.reward_focus(), public.reward_todo(),
  public.reward_adv(), public.th_today(), public.th_day_start() from public, anon, authenticated;
revoke execute on function public.arena_start(), public.arena_finish(uuid, integer, integer, integer, boolean), public.xp_leaderboard(text)
  from public, anon;
grant execute on function public.arena_start(), public.arena_finish(uuid, integer, integer, integer, boolean), public.xp_leaderboard(text)
  to authenticated;
