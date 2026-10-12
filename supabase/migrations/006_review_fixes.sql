-- แก้ตามรีวิวของฝ่ายตรวจโค้ด (รอบตรวจทุก Phase)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run (รันครั้งเดียว รันซ้ำได้ไม่พัง)

-- 1) Pomodoro: ห้ามเริ่มรัวๆ และเอาโหมดทดสอบ 1 นาทีออก (บนเว็บจริงไม่ควรมี)
create or replace function public.start_focus(planned integer) returns json
language plpgsql security definer set search_path = public as $$
declare
  s focus_sessions;
begin
  if auth.uid() is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  if planned not in (15, 25, 50) then raise exception 'เลือกได้ 15, 25 หรือ 50 นาที'; end if;
  -- กันกดเริ่มรัวๆ (ทุกครั้งเพิ่มแถวในตาราง)
  if exists (select 1 from focus_sessions where user_id = auth.uid() and started_at > now() - interval '10 seconds') then
    raise exception 'ใจเย็นๆ รอสักครู่แล้วค่อยเริ่มใหม่';
  end if;
  perform close_open_focus(auth.uid());
  insert into focus_sessions (user_id, planned_minutes) values (auth.uid(), planned) returning * into s;
  return json_build_object('started_at', s.started_at, 'planned_minutes', s.planned_minutes, 'now', now());
end;
$$;

-- 2) To-do: ต้องล็อกอินถึงจะดูงานของคนอื่นได้ และถ้าเจ้าของปิดบ้านไว้ งานก็ต้องถูกซ่อนด้วย
drop policy if exists "ดูงานของตัวเอง หรืองานที่เปิดสาธารณะ" on public.todos;
drop policy if exists "ดูงานของตัวเอง หรืองานสาธารณะของบ้านที่เปิดอยู่" on public.todos;
create policy "ดูงานของตัวเอง หรืองานสาธารณะของบ้านที่เปิดอยู่"
  on public.todos for select to authenticated
  using (owner_id = auth.uid() or (is_public and public.room_is_visitable(owner_id)));

-- 3) Snake: นอกจากห้ามเล่นเร็วกว่าเวลาจริง ตอนนี้ห้ามเล่นช้ากว่ามากๆ ด้วย
create or replace function public.finish_snake(run_id uuid, inputs jsonb) returns json
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

  -- เล่นช้ากว่าความเร็วจริงมากๆ ก็ไม่ผ่าน (แก้โค้ดให้งูช้าลงจะได้เล่นง่าย) เผื่อนับถอยหลัง/เน็ตช้า 15 วินาที
  if valid and elapsed > final_ticks * 0.110 * 1.5 + 15 then
    valid := false;
  end if;

  -- ข้อมูลไม่ผ่าน = 0 คะแนน และปิดรอบนี้ทันที (ส่งซ้ำไม่ได้)
  if not valid then final_score := 0; end if;
  update game_runs set finished_at = now(), score = final_score, ticks = final_ticks where id = run.id;
  select max(score) into best from game_runs where user_id = uid and game = 'snake';
  return json_build_object('score', final_score, 'ticks', final_ticks, 'best', best, 'rejected', not valid);
end;
$$;
