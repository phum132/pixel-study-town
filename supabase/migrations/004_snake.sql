-- Phase 7: มินิเกม Snake ที่ฐานข้อมูลเป็นคนนับคะแนน
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
--
-- หลักการกันโกง: เบราว์เซอร์ไม่ได้ส่ง "คะแนน" มา แต่ส่ง "รายการกดปุ่ม" [[ตาที่, ทิศ], ...]
-- ฐานข้อมูลจำลองเกมใหม่ทั้งตาด้วย seed ที่สุ่มให้ตอนเริ่ม แล้วนับคะแนนเอง
-- กติกาต้องตรงกับ client/src/lib/snake.ts ทุกบรรทัด

create table public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null default 'snake',
  seed integer not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score integer, -- null = ยังเล่นไม่จบ
  ticks integer
);

create index game_runs_user on public.game_runs (user_id, started_at);
create index game_runs_best on public.game_runs (game, score desc) where score is not null;

alter table public.game_runs enable row level security;

create policy "ดูรอบเล่นของตัวเอง"
  on public.game_runs for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.game_runs from anon, authenticated;

-- ---------- ตัวจำลองเกม (กติกาเดียวกับในเบราว์เซอร์) ----------
-- กระดาน 20x20, งูยาว 3 เริ่มที่แถว 10 ช่อง 8-10 หันขวา
-- ทิศ: 0 ขึ้น, 1 ขวา, 2 ลง, 3 ซ้าย (หันกลับหลังทันทีไม่ได้)
-- อาหาร: สุ่มเลขด้วย LCG แล้วนับช่องว่างจากซ้ายบนไปขวาล่าง
-- max_ticks = จำนวนตาที่เวลาจริงอนุญาต เกินนี้หยุดทันที (over_time) ฐานข้อมูลจะได้ไม่ทำงานเกินเวลาที่เล่นจริง
create function public.simulate_snake(
  seed integer, inputs jsonb, max_ticks integer,
  out score integer, out ticks integer, out over_time boolean
)
language plpgsql immutable as $$
declare
  w constant integer := 20;
  h constant integer := 20;
  n constant integer := 400;
  dx constant integer[] := array[0, 1, 0, -1];
  dy constant integer[] := array[-1, 0, 1, 0];
  occ boolean[] := array_fill(false, array[400]); -- ช่องที่ตัวงูทับอยู่ (index เริ่มที่ 1)
  body integer[] := array_fill(0, array[400]);    -- ตัวงูแบบวงแหวน: tail_i → head_i
  head_i integer := 3;
  tail_i integer := 1;
  len integer := 3;
  dir integer := 1;
  rng bigint := seed;
  food integer := -2; -- -2 = ต้องสุ่มอาหารใหม่, -1 = ไม่มีช่องว่างแล้ว (ชนะ)
  n_inputs integer := jsonb_array_length(inputs);
  k integer := 0;
  in_tick integer;
  in_dir integer;
  hx integer;
  hy integer;
  nh integer;
  free_count integer;
  r integer;
  c integer;
  i integer;
begin
  score := 0;
  ticks := 0;
  over_time := false;
  body[1] := 208; body[2] := 209; body[3] := 210; -- (8,10) (9,10) (10,10)
  occ[209] := true; occ[210] := true; occ[211] := true;

  loop
    if food = -2 then
      free_count := n - len;
      if free_count = 0 then
        food := -1;
        exit;
      end if;
      rng := (rng * 1103515245 + 12345) % 2147483648;
      r := (rng % free_count)::integer;
      c := 0;
      for i in 0 .. n - 1 loop
        if not occ[i + 1] then
          if c = r then
            food := i;
            exit;
          end if;
          c := c + 1;
        end if;
      end loop;
    end if;

    ticks := ticks + 1;
    if ticks > max_ticks then
      over_time := true;
      exit;
    end if;

    -- เปลี่ยนทิศตามที่กดไว้ในตานี้ (ตาละไม่เกิน 1 ครั้ง ต้องเรียงตาจากน้อยไปมาก)
    if k < n_inputs then
      in_tick := (inputs -> k ->> 0)::integer;
      in_dir := (inputs -> k ->> 1)::integer;
      if in_tick < ticks then
        raise exception 'ข้อมูลการเล่นไม่ถูกต้อง';
      elsif in_tick = ticks then
        if in_dir between 0 and 3 and in_dir <> (dir + 2) % 4 then
          dir := in_dir;
        end if;
        k := k + 1;
      end if;
    end if;

    hx := body[head_i] % w + dx[dir + 1];
    hy := body[head_i] / w + dy[dir + 1];
    exit when hx < 0 or hx >= w or hy < 0 or hy >= h; -- ชนขอบ
    nh := hy * w + hx;

    if nh <> food then -- ไม่ได้กินอาหาร: หางขยับตาม
      occ[body[tail_i] + 1] := false;
      tail_i := tail_i % n + 1;
      len := len - 1;
    end if;
    exit when occ[nh + 1]; -- ชนตัวเอง

    head_i := head_i % n + 1;
    body[head_i] := nh;
    occ[nh + 1] := true;
    len := len + 1;
    if nh = food then
      score := score + 1;
      food := -2;
    end if;
  end loop;
end;
$$;

revoke execute on function public.simulate_snake(integer, jsonb, integer) from public, anon, authenticated;

-- ---------- เริ่มเกม: สุ่ม seed ให้ ----------
create function public.start_snake() returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  run game_runs;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  if exists (select 1 from game_runs where user_id = uid and started_at > now() - interval '2 seconds') then
    raise exception 'ใจเย็นๆ รอสักครู่แล้วค่อยเริ่มใหม่';
  end if;
  -- รอบที่เริ่มไว้แล้วไม่ได้ส่งคะแนน = 0 คะแนน
  update game_runs set finished_at = now(), score = 0, ticks = 0
   where user_id = uid and finished_at is null;
  insert into game_runs (user_id, seed) values (uid, floor(random() * 2147483646)::integer + 1)
  returning * into run;
  return json_build_object('run_id', run.id, 'seed', run.seed);
end;
$$;

-- ---------- จบเกม: ส่งรายการกดปุ่ม → ฐานข้อมูลนับคะแนนเอง ----------
create function public.finish_snake(run_id uuid, inputs jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  run game_runs;
  sim record;
  elapsed numeric;
  max_ticks integer;
  best integer;
  final_score integer := 0;
  final_ticks integer := 0;
  valid boolean := true;
  item jsonb;
  t numeric;
  d numeric;
  prev numeric := 0;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  select * into run from game_runs g where g.id = run_id and g.user_id = uid for update;
  if not found then raise exception 'ไม่พบรอบเล่นนี้'; end if;
  if run.finished_at is not null then raise exception 'รอบนี้ส่งคะแนนไปแล้ว'; end if;

  -- ทุกตาใช้เวลา 110 มิลลิวินาที เล่นเร็วกว่าเวลาจริงไม่ได้ (เผื่อเน็ตช้า 2 วินาที)
  elapsed := extract(epoch from now() - run.started_at);
  max_ticks := least(100000, floor((elapsed + 2) / 0.110))::integer;

  -- ตรวจรูปแบบข้อมูลให้ครบก่อนเริ่มจำลอง: [[ตาที่, ทิศ], ...] ตาเรียงจากน้อยไปมาก ทิศ 0-3
  if jsonb_typeof(inputs) <> 'array' or jsonb_array_length(inputs) > 20000 or elapsed > 3 * 3600 then
    valid := false;
  else
    for item in select value from jsonb_array_elements(inputs) loop
      if jsonb_typeof(item) <> 'array' or jsonb_array_length(item) <> 2
         or jsonb_typeof(item -> 0) <> 'number' or jsonb_typeof(item -> 1) <> 'number' then
        valid := false;
        exit;
      end if;
      t := (item ->> 0)::numeric;
      d := (item ->> 1)::numeric;
      if t <> trunc(t) or t <= prev or t > max_ticks or d not in (0, 1, 2, 3) then
        valid := false;
        exit;
      end if;
      prev := t;
    end loop;
  end if;

  if valid then
    begin
      select * into sim from simulate_snake(run.seed, inputs, max_ticks);
      valid := not sim.over_time;
      final_score := sim.score;
      final_ticks := sim.ticks;
    exception when others then
      valid := false;
    end;
  end if;

  -- ข้อมูลไม่ผ่าน = 0 คะแนน และปิดรอบนี้ทันที (ส่งซ้ำไม่ได้)
  if not valid then final_score := 0; end if;
  update game_runs set finished_at = now(), score = final_score, ticks = final_ticks where id = run.id;
  select max(score) into best from game_runs where user_id = uid and game = 'snake';
  return json_build_object('score', final_score, 'ticks', final_ticks, 'best', best, 'rejected', not valid);
end;
$$;

-- ---------- 10 อันดับคะแนนสูงสุด ----------
create function public.snake_top() returns table (username text, best integer)
language sql stable security definer set search_path = public as $$
  select p.username, max(g.score)::integer as best
    from game_runs g join profiles p on p.id = g.user_id
   where g.game = 'snake' and g.score > 0
   group by p.username
   order by best desc, p.username
   limit 10;
$$;

revoke execute on function public.start_snake(), public.finish_snake(uuid, jsonb), public.snake_top() from public, anon;
grant execute on function public.start_snake(), public.finish_snake(uuid, jsonb), public.snake_top() to authenticated;
