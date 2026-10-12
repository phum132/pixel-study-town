-- Phase 9b: สนามรบ 5 แมพ (ปลดล็อกทีละแมพ) + กาชา (เศษพลัง / การ์ดสกิล)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run (ต้องรัน 008 และ 009 มาก่อน / รันซ้ำได้ไม่พัง)

-- ---------- แมพ ----------
alter table public.arena_runs add column if not exists map integer not null default 1;

-- แมพ 1 เล่นได้เลย / แมพต่อไปต้องชนะบอสแมพก่อนหน้า (จดไว้ใน inventory เป็น map:N)
drop function if exists public.arena_start();
create or replace function public.arena_start(p_map integer default 1) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  if p_map is null or p_map not between 1 and 5 then raise exception 'ไม่มีแมพนี้'; end if;
  if p_map > 1 and not exists (select 1 from inventory where user_id = uid and item = 'map:' || (p_map - 1)) then
    raise exception 'ต้องชนะบอสแมพ % ก่อน', p_map - 1;
  end if;
  perform pg_advisory_xact_lock(hashtext('arena' || uid::text));
  if (select count(*) from arena_runs where user_id = uid and started_at > now() - interval '10 minutes') >= 15 then
    raise exception 'เริ่มรอบถี่เกินไป พักสักครู่นะ';
  end if;
  delete from arena_runs where user_id = uid and started_at < now() - interval '7 days';
  insert into arena_runs (user_id, map) values (uid, p_map) returning id into rid;
  return json_build_object('run_id', rid, 'map', p_map);
end;
$$;

-- จบรอบ: เหมือน 008 แต่แมพหลังๆ ได้ XP มากขึ้น (+20% ต่อแมพ) และชนะแล้วปลดล็อกแมพถัดไป
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
  v_sec := greatest(0, least(coalesce(p_sec, 0), real_sec + 5, 1800));
  v_kills := greatest(0, least(coalesce(p_kills, 0), v_sec * 3));
  v_won := coalesce(p_won, false) and v_sec >= 600;
  v_coins := greatest(0, least(coalesce(p_coins, 0), v_kills / 8 + (v_sec / 60) * 5, 60));
  if v_won then v_coins := v_coins + 20; end if;
  v_xp := ((v_sec / 10 + case when v_won then 50 else 0 end) * (1 + 0.2 * (run.map - 1)))::integer;

  select coalesce(sum(coins), 0), coalesce(sum(xp), 0) into day_coins, day_xp
    from wallet_log where user_id = uid and source = 'arena' and created_at >= th_day_start();
  if v_coins > 150 - day_coins then v_coins := greatest(0, 150 - day_coins); capped := true; end if;
  if v_xp > 800 - day_xp then v_xp := greatest(0, 800 - day_xp); capped := true; end if;

  update arena_runs set finished_at = now(), sec = v_sec, kills = v_kills, won = v_won, coins = v_coins, xp = v_xp where id = run.id;
  perform grant_reward(uid, 'arena', run.id::text, v_coins, v_xp,
    'สนามรบแมพ ' || run.map || ' ' || (v_sec / 60) || ':' || lpad((v_sec % 60)::text, 2, '0') || case when v_won then ' (ชนะบอส)' else '' end);
  if v_won then
    insert into inventory (user_id, item, level) values (uid, 'map:' || run.map, 1) on conflict (user_id, item) do nothing;
  end if;
  return json_build_object('coins', v_coins, 'xp', v_xp, 'capped', capped, 'won', v_won, 'map', run.map);
end;
$$;

-- ---------- กาชา ----------
-- ผลที่ได้ (ต้องตรงกับ client/src/lib/gacha.ts):
--   70% เศษพลัง  g:dmg g:hp g:speed g:haste g:magnet (สะสมได้ชนิดละ 20 ขั้น ถ้าเต็มแล้วได้เหรียญคืน 30)
--   25% การ์ดสกิลพื้นฐาน card:<ธาตุ>:<รูปแบบ> (ได้ซ้ำ = การ์ดขั้นสูงขึ้น สูงสุด 3)
--    5% การ์ดสกิลผสม (ธาตุ 2 แบบ หรือรูปแบบ 2 แบบ)
-- หมุน 10 ครั้งได้การ์ดอย่างน้อย 1 ใบเสมอ
-- รหัสสกิลเรียงชื่อตามตัวอักษรแบบเดียวกับ skillId() ใน client/src/lib/skills.ts
create or replace function public.gacha_roll(force_card boolean) returns text
language plpgsql volatile set search_path = public as $$
declare
  els text[] := array['dark', 'earth', 'fire', 'ice', 'light', 'poison', 'thunder', 'wind']; -- เรียงตามตัวอักษรแล้ว
  frm text[] := array['beam', 'bolt', 'bomb', 'nova', 'orbit', 'rain', 'slash', 'trap'];
  shards text[] := array['dmg', 'hp', 'speed', 'haste', 'magnet'];
  r double precision := random();
  i integer;
  j integer;
begin
  if force_card and r < 0.7 then r := 0.7 + random() * 0.3; end if;
  if r < 0.7 then return 'g:' || shards[1 + floor(random() * 5)::integer]; end if;
  if r < 0.95 then return 'card:' || els[1 + floor(random() * 8)::integer] || ':' || frm[1 + floor(random() * 8)::integer]; end if;
  -- ผสม: ครึ่งหนึ่งธาตุคู่ ครึ่งหนึ่งรูปแบบคู่
  i := 1 + floor(random() * 8)::integer;
  loop
    j := 1 + floor(random() * 8)::integer;
    exit when j <> i;
  end loop;
  if random() < 0.5 then
    return 'card:' || els[least(i, j)] || '+' || els[greatest(i, j)] || ':' || frm[1 + floor(random() * 8)::integer];
  end if;
  return 'card:' || els[1 + floor(random() * 8)::integer] || ':' || frm[least(i, j)] || '+' || frm[greatest(i, j)];
end;
$$;

create or replace function public.gacha_pull(p_count integer) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  price integer;
  have integer;
  got text;
  lv integer;
  refund integer := 0;
  carded boolean := false;
  results json[] := '{}';
  cap integer;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  if p_count not in (1, 10) then raise exception 'หมุนได้ครั้งละ 1 หรือ 10'; end if;
  price := case p_count when 1 then 100 else 900 end;
  select coins into have from profiles where id = uid for update;
  if have < price then raise exception 'เหรียญไม่พอ (ต้องใช้ % เหรียญ มีอยู่ % เหรียญ)', price, have; end if;
  update profiles set coins = coins - price where id = uid;

  for n in 1..p_count loop
    got := gacha_roll(p_count = 10 and n = p_count and not carded);
    if got like 'card:%' then carded := true; end if;
    cap := case when got like 'g:%' then 20 else 3 end;
    select level into lv from inventory where user_id = uid and item = got;
    if coalesce(lv, 0) >= cap then
      -- ได้ของที่เต็มแล้ว = คืนเหรียญ
      refund := refund + 30;
      results := results || json_build_object('item', got, 'level', lv, 'refund', 30);
    else
      insert into inventory (user_id, item, level) values (uid, got, 1)
        on conflict (user_id, item) do update set level = inventory.level + 1, bought_at = now()
        returning level into lv;
      results := results || json_build_object('item', got, 'level', lv, 'refund', 0);
    end if;
  end loop;

  if refund > 0 then update profiles set coins = coins + refund where id = uid; end if;
  insert into wallet_log (user_id, source, ref, coins, xp, note)
    values (uid, 'shop', 'gacha:' || gen_random_uuid(), -price + refund, 0, 'หมุนกาชา ' || p_count || ' ครั้ง');
  return json_build_object('results', array_to_json(results), 'coins', have - price + refund);
end;
$$;

revoke execute on function public.gacha_roll(boolean) from public, anon, authenticated;
revoke execute on function public.gacha_pull(integer), public.arena_start(integer) from public, anon;
grant execute on function public.gacha_pull(integer), public.arena_start(integer) to authenticated;
