-- Phase 8: ด่านผจญภัยวิชาคณิต (เล่นคนเดียว 10 ด่าน x 3 ระดับ)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run (รันซ้ำได้ไม่พัง)
--
-- หลักการกันโกง: ฐานข้อมูลเป็นคนสุ่มโจทย์ เก็บเฉลยไว้เอง และตรวจคำตอบเอง
-- เบราว์เซอร์ได้แค่ "โจทย์ + ตัวเลือก 4 ข้อ" เฉลยถูกส่งกลับไปหลังตอบแล้วเท่านั้น
-- ตอบผิด = เสียหัวใจ (มี 3 ดวง) / ตอบถูก = มอนสเตอร์เสียเลือด 1 / ล้มมอนครบ = ผ่านด่าน
-- ดาว = หัวใจที่เหลือตอนผ่าน (1-3) / คะแนน = ดาวรวม x น้ำหนักระดับ (ม.ต้น 1, ม.ปลาย 2, มหาลัย 3)

-- ---------- ตาราง ----------
create table if not exists public.adv_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (subject in ('math')),
  level text not null check (level in ('lower', 'upper', 'uni')),
  stage integer not null check (stage between 1 and 10),
  hearts integer not null default 3,
  monsters integer[] not null, -- เลือดที่เหลือของมอนแต่ละตัว
  status text not null default 'playing' check (status in ('playing', 'won', 'lost', 'quit')),
  correct integer not null default 0,
  wrong integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists adv_runs_user on public.adv_runs (user_id, started_at desc);

create table if not exists public.adv_questions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.adv_runs (id) on delete cascade,
  monster integer not null,
  kind text not null,
  prompt text not null,
  choices text[] not null,
  answer integer not null, -- 1-4 (เฉลย ห้ามส่งให้เบราว์เซอร์ก่อนตอบ)
  explain text,
  created_at timestamptz not null default now(),
  deadline timestamptz not null,
  picked integer,
  is_correct boolean,
  answered_at timestamptz
);
create index if not exists adv_questions_run on public.adv_questions (run_id, created_at desc);

-- ด่านที่ผ่านแล้วและดาวที่ดีที่สุด (ปลดล็อกด่านถัดไป + คิดคะแนนกระดานอันดับ)
create table if not exists public.adv_best (
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  level text not null,
  stage integer not null,
  stars integer not null check (stars between 1 and 3),
  cleared_at timestamptz not null default now(),
  primary key (user_id, subject, level, stage)
);

alter table public.adv_runs enable row level security;
alter table public.adv_questions enable row level security; -- ไม่มี policy = ไม่มีใครอ่านตรงๆ ได้ (เฉลยอยู่ในนี้)
alter table public.adv_best enable row level security;

drop policy if exists "ดูรอบผจญภัยของตัวเอง" on public.adv_runs;
create policy "ดูรอบผจญภัยของตัวเอง" on public.adv_runs for select to authenticated using (user_id = auth.uid());
drop policy if exists "ดูด่านที่ผ่านของตัวเอง" on public.adv_best;
create policy "ดูด่านที่ผ่านของตัวเอง" on public.adv_best for select to authenticated using (user_id = auth.uid());

revoke all on public.adv_questions from anon, authenticated;
revoke insert, update, delete on public.adv_runs, public.adv_best from anon, authenticated;

-- ---------- ตัวช่วยสุ่มและจัดรูปตัวเลข ----------
create or replace function public.adv_r(lo bigint, hi bigint) returns bigint
language sql volatile as $$ select lo + floor(random() * (hi - lo + 1))::bigint $$;

-- สุ่มที่ไม่ใช่ 0
create or replace function public.adv_rnz(lo bigint, hi bigint) returns bigint
language plpgsql volatile as $$
declare v bigint;
begin
  loop
    v := adv_r(lo, hi);
    exit when v <> 0;
  end loop;
  return v;
end;
$$;

-- สุ่ม ±2..lim (ไม่เอา 0 กับ ±1 จะได้ไม่ง่ายเกิน)
create or replace function public.adv_r2(lim bigint) returns bigint
language sql volatile as $$ select (case when random() < 0.5 then -1 else 1 end) * adv_r(2, greatest(lim, 2)) $$;

-- เลขติดลบใช้เครื่องหมายลบตัวยาว (−) อ่านง่ายกว่า
create or replace function public.adv_n(v bigint) returns text
language sql immutable as $$ select replace(v::text, '-', '−') $$;

-- ใส่วงเล็บให้เลขลบ เช่น (−3)
create or replace function public.adv_p(v bigint) returns text
language sql immutable as $$ select case when v < 0 then '(' || adv_n(v) || ')' else v::text end $$;

create or replace function public.adv_sup(v bigint) returns text
language sql immutable as $$ select translate(v::text, '0123456789-', '⁰¹²³⁴⁵⁶⁷⁸⁹⁻') $$;

-- ตัวยกของนิพจน์สั้นๆ เช่น 'x + 3' → ˣ⁺³
create or replace function public.adv_supx(t text) returns text
language sql immutable as $$ select translate(replace(t, ' ', ''), 'x+−0123456789', 'ˣ⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹') $$;

create or replace function public.adv_sub(v bigint) returns text
language sql immutable as $$ select translate(v::text, '0123456789', '₀₁₂₃₄₅₆₇₈₉') $$;

-- เศษส่วนอย่างต่ำ เช่น 6/8 → 3/4, 4/2 → 2
create or replace function public.adv_frac(n bigint, d bigint) returns text
language plpgsql immutable as $$
declare g bigint;
begin
  if d < 0 then n := -n; d := -d; end if;
  g := gcd(n, d);
  if g > 1 then n := n / g; d := d / g; end if;
  if d = 1 then return adv_n(n); end if;
  return adv_n(n) || '/' || d;
end;
$$;

-- หนึ่งพจน์ เช่น (3,'x',true) → 3x, (-1,'x',false) → ' − x'
create or replace function public.adv_term(c bigint, v text, first boolean) returns text
language sql immutable as $$
  select case when c = 0 then ''
    else (case when first then (case when c < 0 then '−' else '' end) else (case when c < 0 then ' − ' else ' + ' end) end)
      || (case when abs(c) = 1 and v <> '' then '' else abs(c)::text end) || v end
$$;

-- พหุนามจากสัมประสิทธิ์ (กำลังสูงสุดก่อน) เช่น {2,-3,1} → 2x² − 3x + 1
create or replace function public.adv_poly(c bigint[], v text default 'x') returns text
language plpgsql immutable as $$
declare
  s text := '';
  len integer := array_length(c, 1);
  pw integer;
begin
  for i in 1..len loop
    pw := len - i;
    s := s || adv_term(c[i], case pw when 0 then '' when 1 then v else v || adv_sup(pw) end, s = '');
  end loop;
  return case when s = '' then '0' else s end;
end;
$$;

-- จำนวนเชิงซ้อน เช่น (3,-4) → 3 − 4i
create or replace function public.adv_cx(re bigint, im bigint) returns text
language plpgsql immutable as $$
declare s text;
begin
  s := adv_term(re, '', true);
  s := s || adv_term(im, 'i', s = '');
  return case when s = '' then '0' else s end;
end;
$$;

create or replace function public.adv_ncr(n bigint, r bigint) returns bigint
language plpgsql immutable as $$
declare v bigint := 1;
begin
  for i in 0..r - 1 loop v := v * (n - i) / (i + 1); end loop;
  return v;
end;
$$;

create or replace function public.adv_npr(n bigint, r bigint) returns bigint
language plpgsql immutable as $$
declare v bigint := 1;
begin
  for i in 0..r - 1 loop v := v * (n - i); end loop;
  return v;
end;
$$;

create or replace function public.adv_pow(b bigint, e bigint) returns bigint
language plpgsql immutable as $$
declare v bigint := 1;
begin
  for i in 1..e loop v := v * b; end loop;
  return v;
end;
$$;

-- เลือกชนิดโจทย์: ด่านสูงขึ้นปลดล็อกชนิดใหม่ และครึ่งหนึ่งจะเป็นชนิดใหม่ล่าสุด 3 แบบ (ด่านหลังๆ จะยากขึ้นจริง)
create or replace function public.adv_pick(kinds text[], mins integer[], st integer) returns text
language plpgsql volatile as $$
declare
  pool text[];
  n integer;
begin
  select array_agg(kinds[i] order by i) into pool from generate_subscripts(kinds, 1) i where mins[i] <= st;
  n := array_length(pool, 1);
  if n > 3 and random() < 0.5 then return pool[n - adv_r(0, 2)]; end if;
  return pool[adv_r(1, n)];
end;
$$;

-- รวมเฉลย + ตัวลวงเป็น 4 ตัวเลือก (ตัวลวงไม่ซ้ำกันและไม่ซ้ำเฉลย) สลับตำแหน่งเฉลยแบบสุ่ม
-- กันเดาเมื่อคำตอบเป็นจำนวนเต็ม:
--   1) สุ่มก่อนว่าเฉลยจะเป็นตัวที่เล็กสุด/ที่ 2/ที่ 3/ใหญ่สุด แล้วเลือกตัวลวงฝั่งน้อยกว่าและมากกว่าให้ได้ตามนั้น
--      (ไม่งั้นเฉลยมักอยู่ตรงกลาง เพราะตัวลวงกระจายรอบคำตอบ)
--   2) ห้ามมีทั้ง คำตอบ+1 และ คำตอบ−1 ในข้อเดียวกัน
create or replace function public.adv_pack(ans text, wrongs text[], out choices text[], out answer integer)
language plpgsql volatile as $$
declare
  pool text[];
  w text[] := '{}';
  extra text;
  base bigint;
  v bigint;
  below integer;
  n_lo integer := 0;
  n_hi integer := 0;
  step integer;
begin
  select coalesce(array_agg(x order by random()), '{}') into pool
    from (select distinct x from unnest(wrongs) x where x is not null and x <> ans) s;

  if ans ~ '^−?[0-9]+$' then
    base := replace(ans, '−', '-')::bigint;
    below := adv_r(0, 3); -- จำนวนตัวลวงที่น้อยกว่าเฉลย
    foreach step in array array[2, 3, 5, 4, 10, 7, 20] loop
      pool := pool || adv_n(base - step) || adv_n(base + step);
    end loop;
    foreach extra in array pool loop
      exit when array_length(w, 1) >= 3;
      continue when extra = ans or extra = any(w) or extra !~ '^−?[0-9]+$';
      v := replace(extra, '−', '-')::bigint;
      continue when (v = base + 1 and adv_n(base - 1) = any(w)) or (v = base - 1 and adv_n(base + 1) = any(w));
      if v < base and n_lo < below then
        n_lo := n_lo + 1;
        w := w || extra;
      elsif v > base and n_hi < 3 - below then
        n_hi := n_hi + 1;
        w := w || extra;
      end if;
    end loop;
  else
    pool := pool || array['0', '1', '−1', '2', '1/2', '−1/2', '3'];
    foreach extra in array pool loop
      exit when array_length(w, 1) >= 3;
      continue when extra = ans or extra = any(w);
      w := w || extra;
    end loop;
  end if;
  select array_agg(x order by random()) into w from unnest(w) x;
  answer := adv_r(1, 4);
  choices := w[1:answer - 1] || ans || w[answer:3];
end;
$$;

-- =========================================================
-- โจทย์ ม.ต้น
-- =========================================================
create or replace function public.adv_q_lower(st integer, out kind text, out prompt text, out ans text, out wrongs text[], out explain text)
language plpgsql volatile set search_path = public as $$
declare
  kinds text[] := array['int_add', 'int_mul', 'order_ops', 'int_div', 'gcd_lcm', 'percent', 'frac', 'lin_eq',
                        'power', 'sqrt', 'area', 'mean', 'ratio', 'system', 'slope', 'expand'];
  mins integer[] := array[1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 10];
  g bigint := st;
  a bigint; b bigint; c bigint; d bigint; k bigint; n bigint; s bigint; x bigint; y bigint; i integer;
  v bigint[];
  ta bigint[] := array[3, 5, 8, 7];
  tb bigint[] := array[4, 12, 15, 24];
  tc bigint[] := array[5, 13, 17, 25];
  pcts bigint[] := array[5, 10, 15, 20, 25, 30, 40, 50, 60, 75];
begin
  kind := adv_pick(kinds, mins, st);
  case kind
  when 'int_add' then
    a := adv_rnz(-(8 + 4 * g), 8 + 4 * g);
    b := adv_rnz(-(8 + 4 * g), 8 + 4 * g);
    if random() < 0.5 then
      prompt := adv_p(a) || ' + ' || adv_p(b) || ' = ?';
      ans := adv_n(a + b);
      wrongs := array[adv_n(a - b), adv_n(b - a), adv_n(-(a + b)), adv_n(a + b + 1), adv_n(a + b - 1)];
    else
      prompt := adv_p(a) || ' − ' || adv_p(b) || ' = ?';
      ans := adv_n(a - b);
      wrongs := array[adv_n(a + b), adv_n(b - a), adv_n(-(a + b)), adv_n(a - b + 1), adv_n(a - b - 1)];
      explain := 'ลบด้วยจำนวนใด = บวกด้วยจำนวนตรงข้าม: ' || adv_p(a) || ' + ' || adv_p(-b) || ' = ' || ans;
    end if;

  when 'int_mul' then
    a := adv_r2(4 + g);
    b := adv_r2(4 + g);
    prompt := adv_p(a) || ' × ' || adv_p(b) || ' = ?';
    ans := adv_n(a * b);
    wrongs := array[adv_n(-(a * b)), adv_n(a * b + a), adv_n(a * b - b), adv_n(a + b)];
    explain := replace(prompt, '?', ans) || case when a < 0 or b < 0 then ' (เครื่องหมายเหมือนกันได้บวก ต่างกันได้ลบ)' else '' end;

  when 'order_ops' then
    a := adv_r(1, 10 + g);
    b := adv_r(2, 5 + g / 2);
    c := adv_r(2, 9);
    if random() < 0.5 then
      prompt := a || ' + ' || b || ' × ' || c || ' = ?';
      ans := adv_n(a + b * c);
      wrongs := array[adv_n((a + b) * c), adv_n(a + b + c), adv_n(a * b + c)];
      explain := 'ทำคูณก่อนบวก: ' || b || ' × ' || c || ' = ' || (b * c) || ' แล้ว ' || a || ' + ' || (b * c) || ' = ' || ans;
    else
      prompt := '(' || a || ' − ' || b || ') × ' || c || ' = ?';
      ans := adv_n((a - b) * c);
      wrongs := array[adv_n(a - b * c), adv_n((b - a) * c), adv_n(a * c - b)];
      explain := 'ทำในวงเล็บก่อน: ' || a || ' − ' || b || ' = ' || adv_n(a - b) || ' แล้ว ' || adv_p(a - b) || ' × ' || c || ' = ' || ans;
    end if;

  when 'int_div' then
    k := adv_r2(5 + g);
    b := adv_r2(9);
    a := k * b;
    prompt := adv_p(a) || ' ÷ ' || adv_p(b) || ' = ?';
    ans := adv_n(k);
    wrongs := array[adv_n(-k), adv_n(k + 1), adv_n(k - 1), adv_n(a - b)];
    explain := replace(prompt, '?', ans) || case when a < 0 or b < 0 then ' (เครื่องหมายเหมือนกันได้บวก ต่างกันได้ลบ)' else '' end;

  when 'gcd_lcm' then
    k := adv_r(2, 6);
    loop
      x := adv_r(2, 7);
      y := adv_r(2, 7);
      exit when x <> y and gcd(x, y) = 1;
    end loop;
    a := k * x;
    b := k * y;
    explain := a || ' = ' || k || ' × ' || x || ', ' || b || ' = ' || k || ' × ' || y
      || ' → ห.ร.ม. = ' || k || ', ค.ร.น. = ' || k || ' × ' || x || ' × ' || y || ' = ' || (k * x * y);
    if random() < 0.5 then
      prompt := 'ห.ร.ม. ของ ' || a || ' และ ' || b || ' คือ?';
      ans := k::text;
      wrongs := array[(k * x * y)::text, (a * b)::text, abs(a - b)::text, (2 * k)::text];
    else
      prompt := 'ค.ร.น. ของ ' || a || ' และ ' || b || ' คือ?';
      ans := (k * x * y)::text;
      wrongs := array[k::text, (a * b)::text, (2 * k * x * y)::text];
    end if;

  when 'percent' then
    k := pcts[adv_r(1, 10)];
    n := 20 * adv_r(1, 5 + g);
    if g < 6 or random() < 0.5 then
      prompt := k || '% ของ ' || n || ' เท่ากับเท่าไร?';
      ans := (k * n / 100)::text;
      wrongs := array[(k * n / 10)::text, (n - k * n / 100)::text, (k * n / 100 + n / 10)::text, (2 * k * n / 100)::text];
      explain := k || '/100 × ' || n || ' = ' || ans;
    else
      prompt := 'สินค้าราคา ' || n || ' บาท ลดราคา ' || k || '% เหลือกี่บาท?';
      ans := (n - k * n / 100)::text;
      wrongs := array[(k * n / 100)::text, adv_n(n - k), (n + k * n / 100)::text];
      explain := 'ส่วนลด = ' || k || '/100 × ' || n || ' = ' || (k * n / 100) || ' บาท เหลือ ' || n || ' − ' || (k * n / 100) || ' = ' || ans || ' บาท';
    end if;

  when 'frac' then
    b := adv_r(2, 4 + g / 2);
    d := adv_r(2, 4 + g / 2);
    a := adv_r(1, b - 1);
    c := adv_r(1, d - 1);
    if g >= 4 and random() < 0.4 then
      prompt := a || '/' || b || ' × ' || c || '/' || d || ' = ?';
      ans := adv_frac(a * c, b * d);
      wrongs := array[adv_frac(a * d + c * b, b * d), adv_frac(a * d, b * c), adv_frac(a + c, b + d), adv_frac(a * c, b + d)];
      explain := 'เศษคูณเศษ ส่วนคูณส่วน: ' || (a * c) || '/' || (b * d) || ' = ' || ans;
    else
      prompt := a || '/' || b || ' + ' || c || '/' || d || ' = ?';
      ans := adv_frac(a * d + c * b, b * d);
      wrongs := array[adv_frac(a + c, b + d), adv_frac(a + c, b * d), adv_frac(a * c, b * d), adv_frac(a * d + c * b, b + d)];
      explain := 'ทำส่วนให้เท่ากัน: ' || (a * d) || '/' || (b * d) || ' + ' || (c * b) || '/' || (b * d) || ' = ' || ans;
    end if;

  when 'lin_eq' then
    a := adv_r(2, 3 + g / 2);
    if g >= 7 and random() < 0.3 then a := -a; end if;
    x := adv_rnz(-(5 + g), 5 + g);
    b := adv_rnz(-(10 + 2 * g), 10 + 2 * g);
    c := a * x + b;
    prompt := 'แก้สมการ ' || adv_poly(array[a, b]) || ' = ' || adv_n(c) || ' ค่า x คือ?';
    ans := adv_n(x);
    wrongs := array[adv_n(-x), adv_n(x + 1), adv_n(x - 1), adv_n(c - b), case when (c + b) % a = 0 then adv_n((c + b) / a) end];
    explain := 'ย้าย ' || adv_n(b) || ' ไปอีกข้าง: ' || adv_n(a) || 'x = ' || adv_n(c - b) || ' แล้วหารด้วย ' || adv_n(a) || ' ได้ x = ' || ans;

  when 'power' then
    i := adv_r(1, case when g >= 7 then 3 else 2 end);
    if i = 1 then
      b := adv_r(2, 3 + g / 3);
      n := adv_r(2, case when b <= 3 then 5 else 3 end);
      prompt := b || adv_sup(n) || ' = ?';
      ans := adv_pow(b, n)::text;
      wrongs := array[(b * n)::text, adv_pow(b, n - 1)::text, adv_pow(b, n + 1)::text, (adv_pow(b, n) + b)::text];
      explain := b || ' คูณกัน ' || n || ' ตัว = ' || ans;
    else
      b := adv_r(2, 7);
      x := adv_r(2, 9);
      y := adv_r(2, 9);
      if i = 2 then
        prompt := b || adv_sup(x) || ' × ' || b || adv_sup(y) || ' = ' || b || 'ⁿ ค่า n คือ?';
        ans := (x + y)::text;
        wrongs := array[(x * y)::text, (x + y + 1)::text, abs(x - y)::text, (x + y - 1)::text];
        explain := 'ฐานเดียวกันคูณกัน เลขชี้กำลังบวกกัน: ' || x || ' + ' || y || ' = ' || ans;
      else
        x := x + y; -- ให้ตัวตั้งมีเลขชี้กำลังมากกว่า
        prompt := b || adv_sup(x) || ' ÷ ' || b || adv_sup(y) || ' = ' || b || 'ⁿ ค่า n คือ?';
        ans := (x - y)::text;
        wrongs := array[(x + y)::text, (x - y + 1)::text, (x - y - 1)::text, case when x % y = 0 then (x / y)::text end];
        explain := 'ฐานเดียวกันหารกัน เลขชี้กำลังลบกัน: ' || x || ' − ' || y || ' = ' || ans;
      end if;
    end if;

  when 'sqrt' then
    if random() < 0.5 then
      n := adv_r(2, 10 + g);
      prompt := '√' || (n * n) || ' = ?';
      ans := n::text;
      wrongs := array[(n + 1)::text, (n - 1)::text, (2 * n)::text, case when n % 2 = 0 then (n * n / 2)::text end];
      explain := n || ' × ' || n || ' = ' || (n * n) || ' ดังนั้น √' || (n * n) || ' = ' || n;
    else
      i := adv_r(1, 4);
      k := case when i = 1 then adv_r(1, 3) else 1 end;
      a := ta[i] * k;
      b := tb[i] * k;
      c := tc[i] * k;
      if random() < 0.5 then
        prompt := 'สามเหลี่ยมมุมฉากมีด้านประกอบมุมฉากยาว ' || a || ' และ ' || b || ' หน่วย ด้านตรงข้ามมุมฉากยาวกี่หน่วย?';
        ans := c::text;
        wrongs := array[(a + b)::text, (c + 1)::text, (c - 1)::text, (c + 2)::text];
        explain := 'c² = ' || a || '² + ' || b || '² = ' || (a * a + b * b) || ' ดังนั้น c = ' || c;
      else
        prompt := 'สามเหลี่ยมมุมฉากมีด้านตรงข้ามมุมฉากยาว ' || c || ' หน่วย ด้านหนึ่งยาว ' || a || ' หน่วย อีกด้านยาวกี่หน่วย?';
        ans := b::text;
        wrongs := array[(c - a)::text, (c + a)::text, (b + 1)::text, (b - 1)::text];
        explain := 'b² = ' || c || '² − ' || a || '² = ' || (c * c - a * a) || ' ดังนั้น b = ' || b;
      end if;
    end if;

  when 'area' then
    i := adv_r(1, case when g >= 8 then 4 else 3 end);
    if i = 1 then
      a := adv_r(3, 8 + g);
      b := adv_r(2, 8 + g);
      if random() < 0.5 then
        prompt := 'สี่เหลี่ยมผืนผ้ากว้าง ' || b || ' ยาว ' || a || ' หน่วย มีพื้นที่กี่ตารางหน่วย?';
        ans := (a * b)::text;
        wrongs := array[(2 * (a + b))::text, (a + b)::text, (a * b + a)::text];
        explain := 'พื้นที่ = กว้าง × ยาว = ' || b || ' × ' || a || ' = ' || ans;
      else
        prompt := 'สี่เหลี่ยมผืนผ้ากว้าง ' || b || ' ยาว ' || a || ' หน่วย มีความยาวรอบรูปกี่หน่วย?';
        ans := (2 * (a + b))::text;
        wrongs := array[(a * b)::text, (a + b)::text, (2 * a + b)::text];
        explain := 'ความยาวรอบรูป = 2 × (กว้าง + ยาว) = 2 × ' || (a + b) || ' = ' || ans;
      end if;
    elsif i = 2 then
      b := 2 * adv_r(2, 8 + g / 2);
      a := adv_r(2, 10 + g);
      prompt := 'สามเหลี่ยมฐานยาว ' || b || ' สูง ' || a || ' หน่วย มีพื้นที่กี่ตารางหน่วย?';
      ans := (a * b / 2)::text;
      wrongs := array[(a * b)::text, (a + b)::text, (a * b / 2 + b)::text];
      explain := 'พื้นที่ = ½ × ฐาน × สูง = ½ × ' || b || ' × ' || a || ' = ' || ans;
    elsif i = 3 then
      c := 7 * adv_r(1, 3);
      if random() < 0.5 then
        prompt := 'วงกลมรัศมี ' || c || ' หน่วย มีพื้นที่กี่ตารางหน่วย? (ใช้ π ≈ 22/7)';
        ans := (22 * c * c / 7)::text;
        wrongs := array[(44 * c / 7)::text, (22 * c / 7)::text, (22 * 4 * c * c / 7)::text];
        explain := 'พื้นที่ = πr² = 22/7 × ' || c || ' × ' || c || ' = ' || ans;
      else
        prompt := 'วงกลมรัศมี ' || c || ' หน่วย มีเส้นรอบวงยาวกี่หน่วย? (ใช้ π ≈ 22/7)';
        ans := (44 * c / 7)::text;
        wrongs := array[(22 * c * c / 7)::text, (22 * c / 7)::text, (88 * c / 7)::text];
        explain := 'เส้นรอบวง = 2πr = 2 × 22/7 × ' || c || ' = ' || ans;
      end if;
    else
      a := adv_r(2, 9);
      b := a + 2 * adv_r(1, 5); -- ด้านคู่ขนานรวมกันเป็นเลขคู่ คำตอบจะเป็นจำนวนเต็ม
      c := adv_r(2, 10);
      prompt := 'สี่เหลี่ยมคางหมูมีด้านคู่ขนานยาว ' || a || ' และ ' || b || ' หน่วย สูง ' || c || ' หน่วย มีพื้นที่กี่ตารางหน่วย?';
      ans := ((a + b) * c / 2)::text;
      wrongs := array[((a + b) * c)::text, (a * b * c / 2)::text, (a + b + c)::text];
      explain := 'พื้นที่ = ½ × (ผลบวกด้านคู่ขนาน) × สูง = ½ × ' || (a + b) || ' × ' || c || ' = ' || ans;
    end if;

  when 'mean' then
    if g >= 8 and random() < 0.5 then
      select array_agg(adv_r(1, 20 + 2 * g)) into v from generate_series(1, 7);
      prompt := 'มัธยฐานของ ' || array_to_string(v, ', ') || ' คือ?';
      select array_agg(e order by e) into v from unnest(v) e;
      ans := v[4]::text;
      wrongs := array[v[3]::text, v[5]::text, ((v[1] + v[7]) / 2)::text, round((select avg(e) from unnest(v) e))::text];
      explain := 'เรียงจากน้อยไปมาก: ' || array_to_string(v, ', ') || ' ตัวตรงกลาง (ตัวที่ 4) คือ ' || ans;
    else
      select array_agg(adv_r(1, 10 + 2 * g)) into v from generate_series(1, 5);
      s := v[1] + v[2] + v[3] + v[4] + v[5];
      v[5] := v[5] + (5 - s % 5) % 5; -- ให้ผลรวมหาร 5 ลงตัว
      s := v[1] + v[2] + v[3] + v[4] + v[5];
      prompt := 'ค่าเฉลี่ยเลขคณิตของ ' || array_to_string(v, ', ') || ' คือ?';
      ans := (s / 5)::text;
      wrongs := array[s::text, (s / 5 + 1)::text, (s / 5 - 1)::text, case when s % 4 = 0 then (s / 4)::text end];
      explain := 'รวมกันได้ ' || s || ' หารด้วยจำนวนข้อมูล 5 ตัว = ' || ans;
    end if;

  when 'ratio' then
    loop
      a := adv_r(1, 7);
      b := adv_r(1, 7);
      exit when a <> b and gcd(a, b) = 1;
    end loop;
    k := adv_r(2, 5 + g);
    if random() < 0.5 then
      prompt := 'ถ้า ' || a || ' : ' || b || ' = ' || (a * k) || ' : n แล้ว n คือ?';
      ans := (b * k)::text;
      wrongs := array[(b + a * k - a)::text, (b * k + k)::text, (a * k)::text, (b + k)::text];
      explain := a || ' × ' || k || ' = ' || (a * k) || ' ดังนั้น n = ' || b || ' × ' || k || ' = ' || ans;
    else
      n := (a + b) * k;
      prompt := 'แบ่งเงิน ' || n || ' บาท ให้ ก กับ ข ในอัตราส่วน ' || a || ' : ' || b || ' ข ได้กี่บาท?';
      ans := (b * k)::text;
      wrongs := array[(a * k)::text, (b * k + k)::text, case when n % 2 = 0 then (n / 2)::text end, (n - b)::text];
      explain := 'ทั้งหมด ' || (a + b) || ' ส่วน = ' || n || ' บาท → ส่วนละ ' || k || ' บาท ข ได้ ' || b || ' ส่วน = ' || ans || ' บาท';
    end if;

  when 'system' then
    x := adv_rnz(-(4 + g), 4 + g);
    y := adv_rnz(-(4 + g), 4 + g);
    if g < 9 or random() < 0.4 then
      prompt := 'ถ้า x + y = ' || adv_n(x + y) || ' และ x − y = ' || adv_n(x - y) || ' ค่า x คือ?';
      ans := adv_n(x);
      wrongs := array[adv_n(y), adv_n(-x), adv_n(x + 1), adv_n(x + y)];
      explain := 'นำสองสมการมาบวกกัน: 2x = ' || adv_n(2 * x) || ' → x = ' || ans;
    else
      loop
        a := adv_r(1, 4); b := adv_rnz(-4, 4); c := adv_r(1, 4); d := adv_rnz(-4, 4);
        exit when a * d - b * c <> 0;
      end loop;
      prompt := 'ถ้า ' || adv_term(a, 'x', true) || adv_term(b, 'y', false) || ' = ' || adv_n(a * x + b * y)
        || ' และ ' || adv_term(c, 'x', true) || adv_term(d, 'y', false) || ' = ' || adv_n(c * x + d * y) || ' ค่า x + y คือ?';
      ans := adv_n(x + y);
      wrongs := array[adv_n(x - y), adv_n(x), adv_n(y), adv_n(x + y + 1)];
      explain := 'แก้ระบบสมการได้ x = ' || adv_n(x) || ', y = ' || adv_n(y) || ' ดังนั้น x + y = ' || ans;
    end if;

  when 'slope' then
    x := adv_r(-5, 5);
    y := adv_r(-5, 5);
    d := adv_rnz(-4, 4);
    k := adv_rnz(-5, 5);
    prompt := 'ความชันของเส้นตรงที่ผ่านจุด (' || adv_n(x) || ', ' || adv_n(y) || ') และ (' || adv_n(x + d) || ', ' || adv_n(y + k * d) || ') คือ?';
    ans := adv_n(k);
    wrongs := array[adv_n(-k), adv_frac(1, k), adv_n(k + 1), adv_n(k * d)];
    explain := 'ความชัน = (y₂ − y₁)/(x₂ − x₁) = ' || adv_p(k * d) || '/' || adv_p(d) || ' = ' || ans;

  else -- expand
    a := adv_rnz(-9, 9);
    b := adv_rnz(-9, 9);
    prompt := '(' || adv_poly(array[1, a]) || ')(' || adv_poly(array[1, b]) || ') = x² + px + q';
    explain := '(' || adv_poly(array[1, a]) || ')(' || adv_poly(array[1, b]) || ') = ' || adv_poly(array[1, a + b, a * b]);
    if random() < 0.5 then
      prompt := prompt || ' ค่า p คือ?';
      ans := adv_n(a + b);
      wrongs := array[adv_n(a * b), adv_n(a - b), adv_n(-(a + b))];
    else
      prompt := prompt || ' ค่า q คือ?';
      ans := adv_n(a * b);
      wrongs := array[adv_n(a + b), adv_n(-(a * b)), adv_n(a * b + 1)];
    end if;
  end case;
  if explain is null then explain := replace(prompt, '?', ans); end if;
end;
$$;

-- =========================================================
-- โจทย์ ม.ปลาย
-- =========================================================
create or replace function public.adv_q_upper(st integer, out kind text, out prompt text, out ans text, out wrongs text[], out explain text)
language plpgsql volatile set search_path = public as $$
declare
  kinds text[] := array['abs_eval', 'set_union', 'expo_eq', 'arith_seq', 'abs_eq', 'geo_seq', 'log', 'quad_root',
                        'arith_sum', 'trig', 'quad_sum', 'comb', 'perm', 'prob_dice', 'compose', 'inverse', 'quad_min',
                        'log_eq', 'prob_coin', 'vec_dot'];
  mins integer[] := array[1, 1, 2, 2, 3, 3, 3, 4, 5, 5, 6, 6, 6, 7, 7, 8, 8, 9, 9, 10];
  g bigint := st;
  a bigint; b bigint; c bigint; d bigint; k bigint; n bigint; r bigint; s bigint; x bigint; i integer;
  -- ค่ามาตรฐานตรีโกณ (โจทย์, เฉลย)
  t_q text[] := array['sin 30°', 'cos 60°', 'sin 45°', 'cos 45°', 'sin 60°', 'cos 30°', 'tan 45°', 'tan 60°', 'tan 30°',
                      'sin 90°', 'cos 0°', 'cos 90°', 'sin 30° + cos 60°', '2 sin 30°', 'sin² 45° + cos² 45°',
                      'tan 45° + sin 30°', 'sin 150°', 'cos 120°', 'sin 120°', 'cos 180°'];
  t_a text[] := array['1/2', '1/2', '√2/2', '√2/2', '√3/2', '√3/2', '1', '√3', '√3/3',
                      '1', '1', '0', '1', '1', '1',
                      '3/2', '1/2', '−1/2', '√3/2', '−1'];
  t_pool text[] := array['0', '1/2', '√2/2', '√3/2', '1', '√3', '√3/3', '2', '−1/2', '3/2', '−1'];
  words text[] := array['BOOK', 'APPLE', 'LEVEL', 'BANANA', 'COFFEE', 'MISS'];
  w_ans bigint[] := array[12, 60, 30, 60, 180, 12];
  w_all bigint[] := array[24, 120, 120, 720, 720, 24];
begin
  kind := adv_pick(kinds, mins, st);
  case kind
  when 'abs_eval' then
    a := adv_rnz(-(5 + 2 * g), 5 + 2 * g);
    b := adv_r(-(5 + 2 * g), 5 + 2 * g);
    c := adv_rnz(-(5 + 2 * g), 5 + 2 * g);
    prompt := '|' || adv_n(a) || '| − |' || adv_n(b) || ' − ' || adv_p(c) || '| = ?';
    ans := adv_n(abs(a) - abs(b - c));
    wrongs := array[adv_n(a - (b - c)), adv_n(abs(a) + abs(b - c)), adv_n(abs(a - abs(b - c))), adv_n(abs(a) - abs(b) - abs(c))];
    explain := '|' || adv_n(a) || '| = ' || abs(a) || ', |' || adv_n(b - c) || '| = ' || abs(b - c) || ' → ' || abs(a) || ' − ' || abs(b - c) || ' = ' || ans;

  when 'set_union' then
    a := adv_r(10, 20 + 3 * g);
    b := adv_r(10, 20 + 3 * g);
    c := adv_r(1, least(a, b) - 1);
    if g < 4 or random() < 0.5 then
      prompt := 'n(A) = ' || a || ', n(B) = ' || b || ', n(A ∩ B) = ' || c || ' แล้ว n(A ∪ B) = ?';
      ans := (a + b - c)::text;
      wrongs := array[(a + b)::text, (a + b + c)::text, (a + b - 2 * c)::text];
      explain := 'n(A ∪ B) = n(A) + n(B) − n(A ∩ B) = ' || a || ' + ' || b || ' − ' || c || ' = ' || ans;
    else
      k := adv_r(1, 15);
      n := a + b - c + k;
      prompt := 'นักเรียน ' || n || ' คน ชอบคณิต ' || a || ' คน ชอบอังกฤษ ' || b || ' คน ชอบทั้งสองวิชา ' || c || ' คน มีกี่คนที่ไม่ชอบทั้งสองวิชา?';
      ans := k::text;
      wrongs := array[adv_n(n - a - b), (k + c)::text, adv_n(n - a - b - c), (k + 2 * c)::text];
      explain := 'ชอบอย่างน้อยหนึ่งวิชา = ' || a || ' + ' || b || ' − ' || c || ' = ' || (a + b - c) || ' คน ไม่ชอบเลย = ' || n || ' − ' || (a + b - c) || ' = ' || ans;
    end if;

  when 'expo_eq' then
    b := (array[2, 3, 5])[adv_r(1, 3)];
    n := adv_r(2, case b when 2 then 7 when 3 then 5 else 4 end);
    k := adv_rnz(-3, 3);
    prompt := b || adv_supx(adv_poly(array[1, k])) || ' = ' || adv_pow(b, n) || ' ค่า x คือ?';
    ans := adv_n(n - k);
    wrongs := array[adv_n(n + k), adv_n(n), adv_n(n - k + 1), adv_n(adv_pow(b, n) - k)];
    explain := adv_pow(b, n) || ' = ' || b || adv_sup(n) || ' → ' || adv_poly(array[1, k]) || ' = ' || n || ' → x = ' || ans;

  when 'arith_seq' then
    a := adv_r(-10, 20);
    d := adv_rnz(-6, 9);
    n := adv_r(8, 20 + 3 * g);
    prompt := 'ลำดับเลขคณิต ' || adv_n(a) || ', ' || adv_n(a + d) || ', ' || adv_n(a + 2 * d) || ', … พจน์ที่ ' || n || ' คือ?';
    ans := adv_n(a + (n - 1) * d);
    wrongs := array[adv_n(a + n * d), adv_n(n * d), adv_n(a + (n - 2) * d), adv_n(a + (n - 1) * d + 1)];
    explain := 'aₙ = a₁ + (n − 1)d = ' || adv_n(a) || ' + ' || (n - 1) || ' × ' || adv_p(d) || ' = ' || ans;

  when 'abs_eq' then
    a := adv_rnz(-9, 9);
    b := adv_r(1, 9 + g);
    prompt := 'สมการ |' || adv_poly(array[1, -a]) || '| = ' || b || ' มีคำตอบ 2 ค่า';
    explain := adv_poly(array[1, -a]) || ' = ' || b || ' หรือ ' || adv_n(-b) || ' → x = ' || adv_n(a + b) || ' หรือ ' || adv_n(a - b);
    if random() < 0.5 then
      prompt := prompt || ' ผลบวกของทั้งสองค่าคือ?';
      ans := adv_n(2 * a);
      wrongs := array[adv_n(2 * b), adv_n(a + b), adv_n(a), adv_n(-2 * a)];
    else
      prompt := prompt || ' ค่าที่มากกว่าคือ?';
      ans := adv_n(a + b);
      wrongs := array[adv_n(a - b), adv_n(b - a), adv_n(b), adv_n(-a - b)];
    end if;

  when 'geo_seq' then
    a := adv_r(1, 5);
    if random() < 0.2 then a := -a; end if;
    r := adv_r(2, 3);
    if g >= 6 and random() < 0.3 then r := -2; end if;
    n := adv_r(4, 7);
    prompt := 'ลำดับเรขาคณิต ' || adv_n(a) || ', ' || adv_n(a * r) || ', ' || adv_n(a * r * r) || ', … พจน์ที่ ' || n || ' คือ?';
    ans := adv_n(a * adv_pow(r, n - 1));
    wrongs := array[adv_n(a * adv_pow(r, n)), adv_n(a * adv_pow(r, n - 2)), adv_n(a * r * (n - 1)), adv_n(-a * adv_pow(r, n - 1))];
    explain := 'aₙ = a₁rⁿ⁻¹ = ' || adv_n(a) || ' × ' || adv_p(r) || adv_sup(n - 1) || ' = ' || ans;

  when 'log' then
    b := (array[2, 3, 5, 10])[adv_r(1, 4)];
    i := adv_r(1, case when g >= 6 then 3 else 2 end);
    if i = 1 then
      n := adv_r(1, case b when 2 then 7 when 3 then 4 else 3 end);
      prompt := 'log' || case when b = 10 then ' ' else adv_sub(b) end || adv_pow(b, n) || ' = ?';
      ans := n::text;
      wrongs := array[(n + 1)::text, (n - 1)::text, (b * n)::text, (adv_pow(b, n) / b)::text];
      explain := b || adv_sup(n) || ' = ' || adv_pow(b, n) || ' ดังนั้นคำตอบคือ ' || n;
    elsif i = 2 then
      x := adv_r(1, 3);
      n := adv_r(1, 3);
      prompt := 'log' || adv_sub(b) || adv_pow(b, x) || ' + log' || adv_sub(b) || adv_pow(b, n) || ' = ?';
      ans := (x + n)::text;
      wrongs := array[(x * n)::text, (x + n + 1)::text, (adv_pow(b, x) + adv_pow(b, n))::text];
      explain := 'log' || adv_sub(b) || adv_pow(b, x) || ' = ' || x || ', log' || adv_sub(b) || adv_pow(b, n) || ' = ' || n || ' รวม = ' || ans;
    else
      n := adv_r(2, case b when 2 then 6 when 3 then 4 else 3 end);
      prompt := 'log' || adv_sub(b) || 'x = ' || n || ' ค่า x คือ?';
      ans := adv_pow(b, n)::text;
      wrongs := array[(b * n)::text, adv_pow(n, b)::text, adv_pow(b, n - 1)::text];
      explain := 'logₐx = n หมายถึง x = aⁿ = ' || b || adv_sup(n) || ' = ' || ans;
    end if;

  when 'quad_root' then
    loop
      a := adv_rnz(-(5 + g / 2), 5 + g / 2);
      b := adv_rnz(-(5 + g / 2), 5 + g / 2);
      exit when a <> b;
    end loop;
    prompt := 'คำตอบที่มากกว่าของสมการ ' || adv_poly(array[1, -(a + b), a * b]) || ' = 0 คือ?';
    ans := adv_n(greatest(a, b));
    wrongs := array[adv_n(-greatest(a, b)), adv_n(least(a, b)), adv_n(-least(a, b)), adv_n(a + b)];
    explain := 'แยกตัวประกอบ (' || adv_poly(array[1, -a]) || ')(' || adv_poly(array[1, -b]) || ') = 0 → x = ' || adv_n(a) || ' หรือ ' || adv_n(b);

  when 'arith_sum' then
    a := adv_r(1, 10);
    d := adv_r(1, 6);
    n := adv_r(5, 10 + g);
    prompt := 'ผลบวก ' || n || ' พจน์แรกของลำดับเลขคณิต ' || a || ', ' || (a + d) || ', ' || (a + 2 * d) || ', … คือ?';
    ans := (n * (2 * a + (n - 1) * d) / 2)::text;
    wrongs := array[(n * (a + (n - 1) * d))::text, (a + (n - 1) * d)::text, (n * (2 * a + (n - 1) * d) / 2 + d)::text, (n * (2 * a + n * d) / 2)::text];
    explain := 'Sₙ = n/2 × (2a₁ + (n − 1)d) = ' || n || '/2 × (' || (2 * a) || ' + ' || ((n - 1) * d) || ') = ' || ans;

  when 'trig' then
    i := adv_r(1, case when g >= 8 then 20 else 13 end);
    prompt := t_q[i] || ' = ?';
    ans := t_a[i];
    wrongs := t_pool;
    explain := 'ค่ามาตรฐาน: sin 30° = 1/2, sin 45° = √2/2, sin 60° = √3/2, tan 45° = 1 → ' || t_q[i] || ' = ' || ans;

  when 'quad_sum' then
    a := adv_r(1, 3);
    loop
      b := adv_rnz(-9, 9);
      c := adv_rnz(-9, 9);
      if b * b < 4 * a * c then c := -abs(c); end if; -- ให้มีคำตอบเป็นจำนวนจริง
      exit when b * b <> 4 * a * c; -- ไม่เอารากซ้ำ (จะมีคำตอบเดียว โจทย์กำกวม)
    end loop;
    if random() < 0.5 then
      prompt := 'ผลบวกของคำตอบของสมการ ' || adv_poly(array[a, b, c]) || ' = 0 คือ?';
      ans := adv_frac(-b, a);
      wrongs := array[adv_frac(b, a), adv_frac(c, a), adv_frac(-c, a), adv_frac(-b, 2 * a)];
      explain := 'ผลบวกคำตอบ = −b/a = −' || adv_p(b) || '/' || a || ' = ' || ans;
    else
      prompt := 'ผลคูณของคำตอบของสมการ ' || adv_poly(array[a, b, c]) || ' = 0 คือ?';
      ans := adv_frac(c, a);
      wrongs := array[adv_frac(-c, a), adv_frac(-b, a), adv_frac(b, a), adv_frac(c, 2 * a)];
      explain := 'ผลคูณคำตอบ = c/a = ' || adv_p(c) || '/' || a || case when adv_n(c) || '/' || a = ans then '' else ' = ' || ans end;
    end if;

  when 'comb' then
    n := adv_r(5, 8 + g / 2);
    r := adv_r(2, 3);
    prompt := 'เลือกตัวแทน ' || r || ' คนจากนักเรียน ' || n || ' คน ได้กี่วิธี?';
    ans := adv_ncr(n, r)::text;
    wrongs := array[adv_npr(n, r)::text, (n * r)::text, (adv_ncr(n, r) + n)::text, adv_ncr(n, r - 1)::text];
    explain := 'C(' || n || ', ' || r || ') = ' || n || '!/(' || r || '! × ' || (n - r) || '!) = ' || ans || ' (ไม่สนลำดับ)';

  when 'perm' then
    i := adv_r(1, case when g >= 8 then 3 else 2 end);
    if i = 1 then
      n := adv_r(3, 6);
      prompt := 'จัดคน ' || n || ' คนยืนเรียงแถว ได้กี่แบบ?';
      ans := adv_npr(n, n)::text;
      wrongs := array[(n * n)::text, (n * (n - 1))::text, adv_npr(n - 1, n - 1)::text, (adv_npr(n, n) / 2)::text];
      explain := n || '! = ' || ans;
    elsif i = 2 then
      n := adv_r(5, 12);
      prompt := 'เลือกประธานและรองประธานจากสมาชิก ' || n || ' คน ได้กี่แบบ?';
      ans := (n * (n - 1))::text;
      wrongs := array[adv_ncr(n, 2)::text, (n * n)::text, (2 * n)::text];
      explain := 'ประธานเลือกได้ ' || n || ' แบบ รองประธานเหลือ ' || (n - 1) || ' แบบ → ' || n || ' × ' || (n - 1) || ' = ' || ans || ' (สนลำดับ)';
    else
      i := adv_r(1, 6);
      prompt := 'นำตัวอักษรของคำว่า "' || words[i] || '" มาเรียงสลับกัน ได้กี่แบบ?';
      ans := w_ans[i]::text;
      wrongs := array[w_all[i]::text, (w_all[i] / 2)::text, (w_ans[i] * 2)::text, (w_ans[i] / 2)::text];
      explain := 'จำนวนตัวอักษร! หารด้วย (จำนวนตัวซ้ำ)! ของแต่ละตัว = ' || w_all[i] || ' ÷ ' || (w_all[i] / w_ans[i]) || ' = ' || ans;
    end if;

  when 'prob_dice' then
    k := adv_r(2, 12);
    n := 6 - abs(7 - k);
    prompt := 'ทอยลูกเต๋า 2 ลูก ความน่าจะเป็นที่ผลรวมเท่ากับ ' || k || ' คือ?';
    ans := adv_frac(n, 36);
    wrongs := array[adv_frac(n, 6), adv_frac(1, k), adv_frac(n + 1, 36), adv_frac(1, 36), adv_frac(n, 12)];
    explain := 'ผลลัพธ์ทั้งหมด 36 แบบ ได้ผลรวม ' || k || ' อยู่ ' || n || ' แบบ → ' || n || '/36 = ' || ans;

  when 'compose' then
    a := adv_rnz(-4, 4); b := adv_r(-6, 6); c := adv_rnz(-4, 4); d := adv_r(-6, 6);
    x := adv_r(-3, 4);
    prompt := 'ถ้า f(x) = ' || adv_poly(array[a, b]) || ' และ g(x) = ' || adv_poly(array[c, d]) || ' แล้ว f(g(' || adv_n(x) || ')) = ?';
    ans := adv_n(a * (c * x + d) + b);
    wrongs := array[adv_n(c * (a * x + b) + d), adv_n((a * x + b) + (c * x + d)), adv_n((a * x + b) * (c * x + d)), adv_n(a * c * x + b)];
    explain := 'g(' || adv_n(x) || ') = ' || adv_n(c * x + d) || ' แล้ว f(' || adv_n(c * x + d) || ') = ' || ans;

  when 'inverse' then
    a := adv_r2(5);
    b := adv_r(-9, 9);
    x := adv_r(-6, 6);
    k := a * x + b;
    prompt := 'ถ้า f(x) = ' || adv_poly(array[a, b]) || ' แล้ว f⁻¹(' || adv_n(k) || ') = ?';
    ans := adv_n(x);
    wrongs := array[adv_n(a * k + b), adv_n(-x), adv_n(x + 1), adv_n(k - b), case when (k + b) % a = 0 then adv_n((k + b) / a) end];
    explain := 'หา x ที่ f(x) = ' || adv_n(k) || ': ' || adv_poly(array[a, b]) || ' = ' || adv_n(k) || ' → x = ' || ans;

  when 'quad_min' then
    a := adv_rnz(-5, 5);
    k := adv_rnz(-10, 10);
    explain := 'จัดรูป y = (' || adv_poly(array[1, -a]) || ')² ' || case when k < 0 then '− ' || abs(k) else '+ ' || k end;
    if random() < 0.5 then
      prompt := 'ค่าต่ำสุดของ y = ' || adv_poly(array[1, -2 * a, a * a + k]) || ' คือ?';
      ans := adv_n(k);
      wrongs := array[adv_n(a * a + k), adv_n(a), adv_n(-k), adv_n(k - a)];
      explain := explain || ' → ค่าต่ำสุด = ' || ans || ' (เมื่อ x = ' || adv_n(a) || ')';
    else
      prompt := 'จุดยอดของพาราโบลา y = ' || adv_poly(array[1, -2 * a, a * a + k]) || ' อยู่ที่ x = ?';
      ans := adv_n(a);
      wrongs := array[adv_n(-a), adv_n(2 * a), adv_n(k), adv_n(-2 * a)];
      explain := explain || ' → จุดยอดอยู่ที่ x = ' || ans;
    end if;

  when 'log_eq' then
    b := adv_r(2, 3);
    n := adv_r(2, case b when 2 then 5 else 3 end);
    k := adv_rnz(-5, 5);
    prompt := 'log' || adv_sub(b) || '(' || adv_poly(array[1, k]) || ') = ' || n || ' ค่า x คือ?';
    ans := adv_n(adv_pow(b, n) - k);
    wrongs := array[adv_n(adv_pow(b, n) + k), adv_n(b * n - k), adv_n(adv_pow(n, b) - k), adv_n(adv_pow(b, n))];
    explain := adv_poly(array[1, k]) || ' = ' || b || adv_sup(n) || ' = ' || adv_pow(b, n) || ' → x = ' || ans;

  when 'prob_coin' then
    n := adv_r(3, 4);
    k := adv_r(1, n - 1);
    prompt := 'โยนเหรียญ ' || n || ' ครั้ง ความน่าจะเป็นที่ออกหัว ' || k || ' ครั้งพอดี คือ?';
    ans := adv_frac(adv_ncr(n, k), adv_pow(2, n));
    wrongs := array[adv_frac(1, adv_pow(2, n)), adv_frac(k, n), adv_frac(adv_ncr(n, k), 2 * n), adv_frac(1, 2)];
    explain := 'ทั้งหมด 2' || adv_sup(n) || ' = ' || adv_pow(2, n) || ' แบบ ออกหัว ' || k || ' ครั้งได้ C(' || n || ', ' || k || ') = ' || adv_ncr(n, k) || ' แบบ → ' || ans;

  else -- vec_dot
    if random() < 0.6 then
      a := adv_rnz(-6, 6); b := adv_rnz(-6, 6); c := adv_rnz(-6, 6); d := adv_rnz(-6, 6);
      prompt := 'u = (' || adv_n(a) || ', ' || adv_n(b) || '), v = (' || adv_n(c) || ', ' || adv_n(d) || ') แล้ว u · v = ?';
      ans := adv_n(a * c + b * d);
      wrongs := array[adv_n(a * c - b * d), adv_n(a * d + b * c), adv_n(a + b + c + d), adv_n(-(a * c + b * d))];
      explain := 'u · v = ' || adv_p(a) || '×' || adv_p(c) || ' + ' || adv_p(b) || '×' || adv_p(d) || ' = ' || ans;
    else
      k := adv_r(1, 4);
      a := 3 * k * (case when random() < 0.5 then -1 else 1 end);
      b := 4 * k * (case when random() < 0.5 then -1 else 1 end);
      if random() < 0.5 then x := a; a := b; b := x; end if;
      prompt := 'ขนาดของเวกเตอร์ (' || adv_n(a) || ', ' || adv_n(b) || ') คือ?';
      ans := (5 * k)::text;
      wrongs := array[(abs(a) + abs(b))::text, (25 * k * k)::text, (5 * k + 1)::text, (7 * k)::text];
      explain := '√(' || adv_p(a) || '² + ' || adv_p(b) || '²) = √' || (25 * k * k) || ' = ' || ans;
    end if;
  end case;
  if explain is null then explain := replace(prompt, '?', ans); end if;
end;
$$;

-- =========================================================
-- โจทย์เตรียมสอบเข้ามหาวิทยาลัย
-- =========================================================
create or replace function public.adv_q_uni(st integer, out kind text, out prompt text, out ans text, out wrongs text[], out explain text)
language plpgsql volatile set search_path = public as $$
declare
  kinds text[] := array['deriv', 'limit', 'det2', 'integral', 'complex_mod', 'geo_inf', 'det3', 'complex_mul',
                        'matrix_mul', 'log_eq2', 'extreme', 'comb_cond', 'tangent', 'prob_draw', 'area_between',
                        'seq_limit', 'variance', 'chain', 'series'];
  mins integer[] := array[1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10];
  g bigint := st;
  a bigint; b bigint; c bigint; d bigint; e bigint; f bigint; h bigint; k bigint; m bigint; n bigint; p bigint; q bigint; r bigint; s bigint; x bigint; y bigint; i integer;
  ta bigint[] := array[3, 5, 8, 7];
  tb bigint[] := array[4, 12, 15, 24];
  tc bigint[] := array[5, 13, 17, 25];
  rn bigint[] := array[1, 1, 2, 1, 3, -1, -1];
  rd bigint[] := array[2, 3, 3, 4, 4, 2, 3];
  dev bigint[];
  -- ส่วนเบี่ยงเบนจากค่าเฉลี่ยที่ให้ความแปรปรวนเป็นจำนวนเต็ม (ชุดละ: ข้อมูล | ความแปรปรวน)
  devs text[] := array['-2,0,0,2|2', '-3,-1,1,3|5', '-2,-1,0,1,2|2', '-4,0,0,4|8', '-3,0,3|6', '-1,-1,1,1|1', '-2,-2,2,2|4', '-3,-3,3,3|9', '-4,-2,0,2,4|8'];
  pick text;
  v bigint[];
begin
  kind := adv_pick(kinds, mins, st);
  case kind
  when 'deriv' then
    a := adv_rnz(-4, 4); b := adv_r(-5, 5); c := adv_r(-6, 6); d := adv_r(-9, 9);
    x := adv_r(-3, 3);
    prompt := 'ถ้า f(x) = ' || adv_poly(array[a, b, c, d]) || ' แล้ว f′(' || adv_n(x) || ') = ?';
    ans := adv_n(3 * a * x * x + 2 * b * x + c);
    wrongs := array[adv_n(a * x * x * x + b * x * x + c * x + d), adv_n(3 * a * x * x + b * x + c), adv_n(3 * a * x * x + 2 * b * x),
                    adv_n(3 * a * x * x + 2 * b * x + c + d)];
    explain := 'f′(x) = ' || adv_poly(array[3 * a, 2 * b, c]) || ' แทน x = ' || adv_n(x) || ' ได้ ' || ans;

  when 'limit' then
    i := adv_r(1, 2);
    if i = 1 then
      a := adv_rnz(-9, 9);
      prompt := 'lim (x → ' || adv_n(a) || ') ของ (' || adv_poly(array[1, 0, -a * a]) || ') / (' || adv_poly(array[1, -a]) || ') = ?';
      ans := adv_n(2 * a);
      wrongs := array['0', adv_n(a), adv_n(a * a), 'หาค่าไม่ได้'];
      explain := 'แยกตัวประกอบ (' || adv_poly(array[1, -a]) || ')(' || adv_poly(array[1, a]) || ') ตัดกับตัวส่วน เหลือ ' || adv_poly(array[1, a]) || ' แทน x = ' || adv_n(a) || ' ได้ ' || ans;
    else
      loop
        r := adv_rnz(-6, 6); s := adv_rnz(-6, 6);
        exit when r <> s;
      end loop;
      prompt := 'lim (x → ' || adv_n(r) || ') ของ (' || adv_poly(array[1, -(r + s), r * s]) || ') / (' || adv_poly(array[1, -r]) || ') = ?';
      ans := adv_n(r - s);
      wrongs := array[adv_n(r + s), adv_n(s - r), '0', 'หาค่าไม่ได้'];
      explain := 'แยกตัวประกอบ (' || adv_poly(array[1, -r]) || ')(' || adv_poly(array[1, -s]) || ') ตัดกับตัวส่วน เหลือ ' || adv_poly(array[1, -s]) || ' แทน x = ' || adv_n(r) || ' ได้ ' || ans;
    end if;

  when 'det2' then
    a := adv_r(-(4 + g), 4 + g); b := adv_r(-(4 + g), 4 + g); c := adv_r(-(4 + g), 4 + g); d := adv_r(-(4 + g), 4 + g);
    prompt := 'A =' || chr(10) || '[ ' || adv_n(a) || '   ' || adv_n(b) || ' ]' || chr(10) || '[ ' || adv_n(c) || '   ' || adv_n(d) || ' ]' || chr(10) || 'det(A) คือ?';
    ans := adv_n(a * d - b * c);
    wrongs := array[adv_n(a * d + b * c), adv_n(b * c - a * d), adv_n(a * c - b * d), adv_n(a * b - c * d)];
    explain := 'det = ad − bc = ' || adv_p(a) || '×' || adv_p(d) || ' − ' || adv_p(b) || '×' || adv_p(c) || ' = ' || ans;

  when 'integral' then
    a := adv_r(0, 3); b := adv_r(-4, 4); c := adv_r(-5, 5);
    if a = 0 and b = 0 then b := 1; end if;
    k := adv_r(1, 3);
    prompt := '∫ จาก 0 ถึง ' || k || ' ของ (' || adv_poly(array[3 * a, 2 * b, c]) || ') dx = ?';
    ans := adv_n(a * k * k * k + b * k * k + c * k);
    wrongs := array[adv_n(6 * a * k + 2 * b), adv_n(a * k * k * k + b * k * k), adv_n(3 * a * k * k * k + 2 * b * k * k + c * k), adv_n(3 * a * k * k + 2 * b * k + c)];
    explain := 'ปฏิยานุพันธ์คือ ' || adv_poly(array[a, b, c, 0]) || ' แทน x = ' || k || ' ลบด้วย x = 0 ได้ ' || ans;

  when 'complex_mod' then
    i := adv_r(1, 4);
    k := case when i = 1 then adv_r(1, 3) else 1 end;
    a := ta[i] * k * (case when random() < 0.5 then -1 else 1 end);
    b := tb[i] * k * (case when random() < 0.5 then -1 else 1 end);
    if random() < 0.5 then x := a; a := b; b := x; end if;
    prompt := '|' || adv_cx(a, b) || '| = ?';
    ans := (tc[i] * k)::text;
    wrongs := array[(abs(a) + abs(b))::text, (tc[i] * tc[i] * k * k)::text, (tc[i] * k + 1)::text, adv_n(a + b)];
    explain := '|a + bi| = √(a² + b²) = √(' || (a * a) || ' + ' || (b * b) || ') = ' || ans;

  when 'geo_inf' then
    a := adv_r(1, 9);
    i := adv_r(1, 7);
    p := rn[i]; q := rd[i];
    prompt := 'ผลบวกอนันต์ ' || a || case when p < 0 then ' − ' else ' + ' end || adv_frac(abs(a * p), q) || ' + ' || adv_frac(a * p * p, q * q)
      || case when p < 0 then ' − ' else ' + ' end || '… = ?';
    ans := adv_frac(a * q, q - p);
    wrongs := array[adv_frac(a * q, q + p), adv_frac(a * q, p), adv_frac(a, q - p), adv_frac(a * p, q - p)];
    explain := 'อัตราส่วนร่วม r = ' || adv_frac(p, q) || ' (|r| < 1) → S∞ = a/(1 − r) = ' || a || '/(1 − ' || adv_frac(p, q) || ') = ' || ans;

  when 'det3' then
    a := adv_r(-3, 3); b := adv_r(-3, 3); c := adv_r(-3, 3);
    d := adv_r(-3, 3); e := adv_r(-3, 3); f := adv_r(-3, 3);
    x := adv_r(-3, 3); y := adv_r(-3, 3); h := adv_r(-3, 3);
    prompt := 'A =' || chr(10) || '[ ' || adv_n(a) || '   ' || adv_n(b) || '   ' || adv_n(c) || ' ]' || chr(10)
      || '[ ' || adv_n(d) || '   ' || adv_n(e) || '   ' || adv_n(f) || ' ]' || chr(10)
      || '[ ' || adv_n(x) || '   ' || adv_n(y) || '   ' || adv_n(h) || ' ]' || chr(10) || 'det(A) คือ?';
    m := a * e * h + b * f * x + c * d * y;
    n := c * e * x + a * f * y + b * d * h;
    ans := adv_n(m - n);
    wrongs := array[adv_n(m), adv_n(n - m), adv_n(m + n), adv_n(a * e * h)];
    explain := 'กฎซาร์รัส: ผลคูณแนวทแยงลง (' || adv_n(m) || ') − ผลคูณแนวทแยงขึ้น (' || adv_n(n) || ') = ' || ans;

  when 'complex_mul' then
    a := adv_rnz(-5, 5); b := adv_rnz(-5, 5); c := adv_rnz(-5, 5); d := adv_rnz(-5, 5);
    prompt := '(' || adv_cx(a, b) || ')(' || adv_cx(c, d) || ') = ?';
    ans := adv_cx(a * c - b * d, a * d + b * c);
    wrongs := array[adv_cx(a * c + b * d, a * d + b * c), adv_cx(a * c - b * d, a * d - b * c), adv_cx(a * c, b * d), adv_cx(a * c + b * d, b * c - a * d)];
    explain := 'กระจายแล้วใช้ i² = −1: (' || adv_n(a * c) || ' − ' || adv_p(b * d) || ') + (' || adv_n(a * d) || ' + ' || adv_p(b * c) || ')i = ' || ans;

  when 'matrix_mul' then
    a := adv_r(-3, 4); b := adv_r(-3, 4); c := adv_r(-3, 4); d := adv_r(-3, 4);
    e := adv_r(-3, 4); f := adv_r(-3, 4); x := adv_r(-3, 4); y := adv_r(-3, 4);
    i := adv_r(1, 4);
    -- A = [a b; c d], B = [e f; x y]
    v := array[a * e + b * x, a * f + b * y, c * e + d * x, c * f + d * y];
    prompt := 'A = [ ' || adv_n(a) || '   ' || adv_n(b) || ' ]   B = [ ' || adv_n(e) || '   ' || adv_n(f) || ' ]' || chr(10)
      || '      [ ' || adv_n(c) || '   ' || adv_n(d) || ' ]          [ ' || adv_n(x) || '   ' || adv_n(y) || ' ]' || chr(10)
      || 'สมาชิกแถว ' || ((i + 1) / 2) || ' หลัก ' || (2 - i % 2) || ' ของ AB คือ?';
    ans := adv_n(v[i]);
    wrongs := array[
      adv_n((array[a * e, b * f, c * x, d * y])[i]),
      adv_n((array[e * a + f * c, e * b + f * d, x * a + y * c, x * b + y * d])[i]),
      adv_n((array[a * e + b * f, a * x + b * y, c * e + d * f, c * x + d * y])[i]),
      adv_n(v[i] + 1)];
    explain := 'แถว ' || ((i + 1) / 2) || ' ของ A คูณ (dot) หลัก ' || (2 - i % 2) || ' ของ B = ' || ans;

  when 'log_eq2' then
    p := adv_r(2, 4);
    q := adv_r(1, p - 1);
    k := adv_pow(2, p) - adv_pow(2, q);
    prompt := 'log₂x + log₂(x − ' || k || ') = ' || (p + q) || ' ค่า x คือ?';
    ans := adv_pow(2, p)::text;
    wrongs := array[adv_pow(2, q)::text, adv_n(-adv_pow(2, q)), adv_pow(2, p + q)::text, (adv_pow(2, p) + k)::text];
    explain := 'x(x − ' || k || ') = 2' || adv_sup(p + q) || ' = ' || adv_pow(2, p + q) || ' → x = ' || ans || ' (คำตอบลบใช้ไม่ได้ เพราะ log ของจำนวนลบไม่มีค่า)';

  when 'extreme' then
    a := adv_r(1, 3);
    c := adv_r(-10, 10);
    prompt := 'ค่าต่ำสุดสัมพัทธ์ของ f(x) = ' || adv_poly(array[1, 0, -3 * a * a, c]) || ' คือ?';
    ans := adv_n(c - 2 * a * a * a);
    wrongs := array[adv_n(c + 2 * a * a * a), adv_n(c), adv_n(-2 * a * a * a), adv_n(a)];
    explain := 'f′(x) = 3x² − ' || (3 * a * a) || ' = 0 → x = ±' || a || ' ต่ำสุดที่ x = ' || a || ': f(' || a || ') = ' || ans;

  when 'comb_cond' then
    m := adv_r(3, 6); n := adv_r(2, 5); r := adv_r(2, 3);
    prompt := 'เลือกคณะทำงาน ' || r || ' คนจากชาย ' || m || ' คน หญิง ' || n || ' คน ให้มีหญิงอย่างน้อย 1 คน ได้กี่วิธี?';
    ans := (adv_ncr(m + n, r) - adv_ncr(m, r))::text;
    wrongs := array[adv_ncr(m + n, r)::text, (n * adv_ncr(m + n - 1, r - 1))::text, adv_ncr(n, r)::text, (adv_ncr(m + n, r) - 1)::text];
    explain := 'ทั้งหมด − ไม่มีหญิงเลย = C(' || (m + n) || ', ' || r || ') − C(' || m || ', ' || r || ') = ' || adv_ncr(m + n, r) || ' − ' || adv_ncr(m, r) || ' = ' || ans;

  when 'tangent' then
    a := adv_rnz(-3, 3); b := adv_r(-5, 5); c := adv_r(-6, 6);
    x := adv_rnz(-3, 3);
    s := 2 * a * x + b; -- ความชัน
    y := a * x * x + b * x + c;
    prompt := 'เส้นสัมผัสเส้นโค้ง y = ' || adv_poly(array[a, b, c]) || ' ที่ x = ' || adv_n(x) || ' ตัดแกน y ที่ y = ?';
    ans := adv_n(y - s * x);
    wrongs := array[adv_n(y), adv_n(s), adv_n(c), adv_n(y + s * x)];
    explain := 'ความชัน y′(' || adv_n(x) || ') = ' || adv_n(s) || ' จุดสัมผัส (' || adv_n(x) || ', ' || adv_n(y) || ') → y = ' || adv_n(s) || 'x + (' || ans || ')';

  when 'prob_draw' then
    r := adv_r(2, 6); b := adv_r(2, 6); n := r + b;
    prompt := 'ถุงมีลูกแก้วแดง ' || r || ' ลูก น้ำเงิน ' || b || ' ลูก หยิบ 2 ลูกพร้อมกัน ความน่าจะเป็นที่ได้สีแดงทั้งคู่ คือ?';
    ans := adv_frac(r * (r - 1), n * (n - 1));
    wrongs := array[adv_frac(r * r, n * n), adv_frac(r, n), adv_frac(r - 1, n - 1), adv_frac(r * (r - 1), n * n)];
    explain := r || '/' || n || ' × ' || (r - 1) || '/' || (n - 1) || ' = ' || ans;

  when 'area_between' then
    k := adv_r(1, 6);
    if random() < 0.5 then
      prompt := 'พื้นที่ที่ปิดล้อมด้วย y = x² และ y = ' || adv_term(k, 'x', true) || ' คือ?';
      ans := adv_frac(k * k * k, 6);
      wrongs := array[adv_frac(k * k * k, 3), adv_frac(k * k * k, 2), adv_frac(k * k, 2), adv_frac(k * k * k, 12)];
      explain := 'ตัดกันที่ x = 0 และ x = ' || k || ': ∫(' || adv_term(k, 'x', true) || ' − x²)dx จาก 0 ถึง ' || k || ' = ' || k || '³/6 = ' || ans;
    else
      prompt := 'พื้นที่ที่ปิดล้อมด้วย y = ' || (k * k) || ' − x² และแกน x คือ?';
      ans := adv_frac(4 * k * k * k, 3);
      wrongs := array[adv_frac(2 * k * k * k, 3), adv_frac(4 * k * k * k, 1), adv_frac(k * k * k, 3), adv_frac(8 * k * k * k, 3)];
      explain := 'ตัดแกน x ที่ x = ±' || k || ': ∫(' || (k * k) || ' − x²)dx จาก −' || k || ' ถึง ' || k || ' = 4×' || k || '³/3 = ' || ans;
    end if;

  when 'seq_limit' then
    a := adv_rnz(-6, 6); b := adv_r(-9, 9); c := adv_r(1, 6); d := adv_r(1, 9);
    if random() < 0.7 then
      prompt := 'lim (n → ∞) ของ (' || adv_poly(array[a, b, 1], 'n') || ') / (' || adv_poly(array[c, 0, d], 'n') || ') = ?';
      ans := adv_frac(a, c);
      wrongs := array[adv_frac(1, d), '0', '∞', adv_frac(b, c), adv_frac(a + b + 1, c + d)];
      explain := 'หารทั้งเศษและส่วนด้วย n² เหลือสัมประสิทธิ์ของ n²: ' || adv_n(a) || '/' || c || case when adv_n(a) || '/' || c = ans then '' else ' = ' || ans end;
    else
      prompt := 'lim (n → ∞) ของ (' || adv_poly(array[a, b], 'n') || ') / (' || adv_poly(array[c, 0, d], 'n') || ') = ?';
      ans := '0';
      wrongs := array[adv_frac(a, c), '∞', adv_frac(b, d), '1'];
      explain := 'ดีกรีตัวส่วน (2) มากกว่าตัวเศษ (1) ลิมิตจึงเป็น 0';
    end if;

  when 'variance' then
    pick := devs[adv_r(1, array_length(devs, 1))];
    dev := string_to_array(split_part(pick, '|', 1), ',')::bigint[];
    k := split_part(pick, '|', 2)::bigint;
    m := adv_r(4, 20);
    select array_agg(m + z order by m + z) into v from unnest(dev) z;
    n := array_length(v, 1);
    s := (select sum(z * z) from unnest(dev) z);
    if k in (1, 4, 9) and random() < 0.4 then
      prompt := 'ส่วนเบี่ยงเบนมาตรฐาน (ประชากร) ของ ' || array_to_string(v, ', ') || ' คือ?';
      ans := (sqrt(k)::bigint)::text;
      wrongs := array[k::text, s::text, (sqrt(k)::bigint + 1)::text, adv_frac(s, n - 1)];
      explain := 'ค่าเฉลี่ย = ' || m || ' ความแปรปรวน = ' || s || '/' || n || ' = ' || k || ' → SD = √' || k || ' = ' || ans;
    else
      prompt := 'ความแปรปรวน (ประชากร) ของ ' || array_to_string(v, ', ') || ' คือ?';
      ans := k::text;
      wrongs := array[s::text, adv_frac(s, n - 1), (k + 1)::text, adv_frac(s, n * n)];
      explain := 'ค่าเฉลี่ย = ' || m || ' → Σ(x − x̄)² = ' || s || ' หารด้วย N = ' || n || ' ได้ ' || ans;
    end if;

  when 'chain' then
    a := adv_r2(3); b := adv_r(-4, 4); n := adv_r(2, 3);
    x := adv_r(-2, 2);
    y := a * x + b;
    prompt := 'ถ้า f(x) = (' || adv_poly(array[a, b]) || ')' || adv_sup(n) || ' แล้ว f′(' || adv_n(x) || ') = ?';
    ans := adv_n(n * a * adv_pow(y, n - 1));
    wrongs := array[adv_n(n * adv_pow(y, n - 1)), adv_n(adv_pow(y, n)), adv_n(n * a * adv_pow(y, n)), adv_n(a * adv_pow(y, n - 1))];
    explain := 'กฎลูกโซ่: f′(x) = ' || n || ' × (' || adv_poly(array[a, b]) || ')' || adv_sup(n - 1) || ' × ' || adv_p(a) || ' แทน x = ' || adv_n(x) || ' ได้ ' || ans;

  else -- series
    n := adv_r(5, 15);
    if random() < 0.5 then
      prompt := '1² + 2² + 3² + … + ' || n || '² = ?';
      ans := (n * (n + 1) * (2 * n + 1) / 6)::text;
      wrongs := array[((n * (n + 1) / 2) * (n * (n + 1) / 2))::text, (n * (n + 1) / 2)::text, (n * n * (n + 1) / 2)::text, (n * (n + 1) * (2 * n + 1) / 3)::text];
      explain := 'สูตร n(n + 1)(2n + 1)/6 = ' || n || '×' || (n + 1) || '×' || (2 * n + 1) || '/6 = ' || ans;
    else
      prompt := '1 + 3 + 5 + … + ' || (2 * n - 1) || ' = ?';
      ans := (n * n)::text;
      wrongs := array[((2 * n - 1) * n)::text, (n * (n + 1))::text, ((2 * n - 1) * (2 * n) / 2)::text, (n * n - 1)::text];
      explain := 'ผลบวกเลขคี่ ' || n || ' ตัวแรก = ' || n || '² = ' || ans;
    end if;
  end case;
  if explain is null then explain := replace(prompt, '?', ans); end if;
end;
$$;

-- ---------- รอบเล่น ----------
-- เวลาตอบต่อข้อ (วินาที) ตามระดับ
create or replace function public.adv_seconds(level text) returns integer
language sql immutable as $$ select case level when 'lower' then 45 when 'upper' then 60 else 90 end $$;

-- เริ่มด่าน: ด่าน 1 เล่นได้เลย ด่านต่อไปต้องผ่านด่านก่อนหน้าในระดับเดียวกันก่อน
create or replace function public.adv_start(p_subject text, p_level text, p_stage integer) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mons integer[];
  run adv_runs;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  if p_subject is distinct from 'math' then raise exception 'ยังไม่มีวิชานี้'; end if;
  if p_level is null or p_level not in ('lower', 'upper', 'uni') then raise exception 'ระดับไม่ถูกต้อง'; end if;
  if p_stage is null or p_stage not between 1 and 10 then raise exception 'ด่านไม่ถูกต้อง'; end if;
  if p_stage > 1 and not exists (
    select 1 from adv_best where user_id = uid and subject = p_subject and level = p_level and stage = p_stage - 1
  ) then
    raise exception 'ต้องผ่านด่าน % ก่อน', p_stage - 1;
  end if;
  perform pg_advisory_xact_lock(hashtext(uid::text)); -- คนเดียวกดเริ่มพร้อมกันหลายแท็บ ให้ทำทีละคำขอ
  -- กันกดเริ่มรัวๆ (ทุกครั้งเพิ่มแถวในตาราง)
  if (select count(*) from adv_runs where user_id = uid and started_at > now() - interval '1 minute') >= 20 then
    raise exception 'เริ่มด่านถี่เกินไป พักสักนาทีแล้วค่อยเล่นต่อนะ';
  end if;

  -- ล้างรอบเก่าเกิน 7 วัน (โจทย์ของรอบนั้นหายไปด้วย) ตารางจะได้ไม่โตเรื่อยๆ ส่วนดาวอยู่ใน adv_best ไม่หาย
  delete from adv_runs where user_id = uid and started_at < now() - interval '7 days';
  -- รอบที่ค้างอยู่ (ปิดแท็บไปกลางคัน) ถือว่าเลิกเล่น
  update adv_runs set status = 'quit', ended_at = now() where user_id = uid and status = 'playing';

  -- มอนสเตอร์: ด่าน 1-3 มี 3 ตัว, 4-7 มี 4 ตัว, 8-9 มี 5 ตัว (ด่าน 5 ขึ้นไปมีตัวหัวหน้าเลือด 2)
  -- ด่าน 10 = ลูกน้อง 2 ตัว + บอสเลือด 5 (บอสอยู่ตัวสุดท้าย)
  if p_stage = 10 then
    mons := array[1, 1, 5];
  else
    mons := array_fill(1, array[3 + p_stage / 4]);
    if p_stage >= 5 then mons[array_length(mons, 1)] := 2; end if;
  end if;

  insert into adv_runs (user_id, subject, level, stage, monsters) values (uid, p_subject, p_level, p_stage, mons) returning * into run;
  return json_build_object('run_id', run.id, 'hearts', run.hearts, 'monsters', run.monsters, 'seconds', adv_seconds(p_level));
end;
$$;

-- ขอโจทย์เมื่อชนมอนสเตอร์ (monster เริ่มนับที่ 0)
-- ถ้ามีโจทย์ที่ยังไม่ได้ตอบ จะได้ข้อเดิมกลับไป (ปิดหน้าต่างหนีโจทย์ยากไม่ได้) / หมดเวลาแล้ว = ตอบผิด
create or replace function public.adv_ask(p_run uuid, p_monster integer) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  run adv_runs;
  open_q adv_questions;
  gen record;
  pack record;
  qid uuid;
  limit_s integer;
  asked integer;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  select * into run from adv_runs where id = p_run and user_id = uid for update;
  if not found then raise exception 'ไม่พบรอบเล่นนี้'; end if;
  if run.status <> 'playing' then raise exception 'รอบนี้จบไปแล้ว'; end if;
  limit_s := adv_seconds(run.level);

  select * into open_q from adv_questions where run_id = run.id and answered_at is null order by created_at desc limit 1;
  if found then
    if now() <= open_q.deadline then
      return json_build_object('question_id', open_q.id, 'monster', open_q.monster - 1, 'prompt', open_q.prompt, 'choices', open_q.choices,
        'seconds_left', greatest(0, extract(epoch from open_q.deadline - now())), 'seconds', limit_s, 'hearts', run.hearts);
    end if;
    -- ปล่อยให้หมดเวลา = ตอบผิด
    update adv_questions set answered_at = now(), is_correct = false where id = open_q.id;
    run.hearts := run.hearts - 1;
    update adv_runs set hearts = run.hearts, wrong = wrong + 1,
      status = case when run.hearts <= 0 then 'lost' else status end,
      ended_at = case when run.hearts <= 0 then now() else ended_at end
      where id = run.id;
    if run.hearts <= 0 then
      return json_build_object('status', 'lost', 'hearts', 0);
    end if;
  end if;

  if p_monster is null or p_monster < 0 or p_monster >= array_length(run.monsters, 1) then raise exception 'ไม่พบมอนสเตอร์ตัวนี้'; end if;
  if run.monsters[p_monster + 1] <= 0 then raise exception 'มอนสเตอร์ตัวนี้แพ้ไปแล้ว'; end if;
  select count(*) into asked from adv_questions where run_id = run.id;
  if asked >= 80 then raise exception 'รอบนี้ยาวเกินไปแล้ว ลองเริ่มด่านใหม่'; end if;
  if (select count(*) from adv_questions aq join adv_runs ar on ar.id = aq.run_id
       where ar.user_id = uid and aq.created_at > now() - interval '1 hour') >= 600 then
    raise exception 'ตอบโจทย์ไปเยอะมากแล้วในชั่วโมงนี้ พักสายตาก่อนนะ';
  end if;

  if run.level = 'lower' then
    select * into gen from adv_q_lower(run.stage);
  elsif run.level = 'upper' then
    select * into gen from adv_q_upper(run.stage);
  else
    select * into gen from adv_q_uni(run.stage);
  end if;
  select * into pack from adv_pack(gen.ans, gen.wrongs);

  insert into adv_questions (run_id, monster, kind, prompt, choices, answer, explain, deadline)
    values (run.id, p_monster + 1, gen.kind, gen.prompt, pack.choices, pack.answer, gen.explain, now() + make_interval(secs => limit_s))
    returning id into qid;
  return json_build_object('question_id', qid, 'monster', p_monster, 'prompt', gen.prompt, 'choices', pack.choices,
    'seconds_left', limit_s, 'seconds', limit_s, 'hearts', run.hearts);
end;
$$;

-- ตอบโจทย์ (choice เริ่มนับที่ 0) → ฐานข้อมูลตรวจเอง แล้วบอกผล + เฉลย
create or replace function public.adv_answer(p_question uuid, p_choice integer) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  q adv_questions;
  run adv_runs;
  ok boolean;
  late boolean;
  m integer;
  new_status text := 'playing';
  v_stars integer;
  best integer;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  -- ล็อกรอบก่อนแล้วค่อยล็อกโจทย์ (ลำดับเดียวกับ adv_ask จะได้ไม่ติดล็อกกันเอง)
  select * into run from adv_runs where id = (select run_id from adv_questions where id = p_question) and user_id = uid for update;
  if not found then raise exception 'ไม่พบโจทย์ข้อนี้'; end if;
  select * into q from adv_questions where id = p_question for update;
  if q.answered_at is not null then raise exception 'ข้อนี้ตอบไปแล้ว'; end if;
  if run.status <> 'playing' then raise exception 'รอบนี้จบไปแล้ว'; end if;

  late := p_choice is null or p_choice < 0 or now() > q.deadline + interval '3 seconds'; -- -1 = หมดเวลา / เผื่อเน็ตช้า 3 วินาที
  ok := not late and p_choice is not null and p_choice + 1 = q.answer;
  update adv_questions set picked = p_choice + 1, is_correct = ok, answered_at = now() where id = q.id;

  m := q.monster;
  if ok then
    run.monsters[m] := greatest(0, run.monsters[m] - 1);
    run.correct := run.correct + 1;
  else
    run.hearts := run.hearts - 1;
    run.wrong := run.wrong + 1;
  end if;

  if run.hearts <= 0 then
    new_status := 'lost';
  elsif not exists (select 1 from unnest(run.monsters) hp where hp > 0) then
    new_status := 'won';
    v_stars := run.hearts;
    insert into adv_best (user_id, subject, level, stage, stars) values (uid, run.subject, run.level, run.stage, v_stars)
      on conflict (user_id, subject, level, stage) do update set stars = greatest(adv_best.stars, excluded.stars),
        cleared_at = case when excluded.stars > adv_best.stars then now() else adv_best.cleared_at end;
    select b.stars into best from adv_best b where b.user_id = uid and b.subject = run.subject and b.level = run.level and b.stage = run.stage;
  end if;

  update adv_runs set hearts = run.hearts, monsters = run.monsters, correct = run.correct, wrong = run.wrong, status = new_status,
    ended_at = case when new_status <> 'playing' then now() else null end
    where id = run.id;

  return json_build_object('correct', ok, 'late', late, 'answer', q.answer - 1, 'explain', q.explain,
    'hearts', run.hearts, 'monster', m - 1, 'monster_hp', run.monsters[m], 'status', new_status, 'stars', v_stars, 'best_stars', best);
end;
$$;

-- เลิกเล่นด่านนี้ (กดออกกลางคัน)
create or replace function public.adv_quit(p_run uuid) returns void
language sql security definer set search_path = public as $$
  update adv_runs set status = 'quit', ended_at = now() where id = p_run and user_id = auth.uid() and status = 'playing';
$$;

-- กระดานอันดับ: subject = null คือรวมทุกวิชา / คะแนน = ดาว x น้ำหนักระดับ
create or replace function public.adv_leaderboard(p_subject text) returns table (username text, character_name text, points integer, stages integer)
language sql stable security definer set search_path = public as $$
  select p.username, p.avatar ->> 'character',
         sum(b.stars * case b.level when 'lower' then 1 when 'upper' then 2 else 3 end)::integer as points,
         count(*)::integer as stages
    from adv_best b join profiles p on p.id = b.user_id
   where p_subject is null or b.subject = p_subject
   group by p.id, p.username, p.avatar
   order by points desc, max(b.cleared_at)
   limit 20;
$$;

-- ---------- สิทธิ์: ผู้เล่นเรียกได้เฉพาะ 5 ฟังก์ชันนี้ ตัวสุ่มโจทย์/ตัวช่วยเรียกตรงไม่ได้ ----------
revoke execute on function public.adv_r(bigint, bigint), public.adv_rnz(bigint, bigint), public.adv_r2(bigint), public.adv_n(bigint),
  public.adv_p(bigint), public.adv_sup(bigint), public.adv_supx(text), public.adv_sub(bigint), public.adv_frac(bigint, bigint), public.adv_term(bigint, text, boolean),
  public.adv_poly(bigint[], text), public.adv_cx(bigint, bigint), public.adv_ncr(bigint, bigint), public.adv_npr(bigint, bigint),
  public.adv_pow(bigint, bigint), public.adv_pick(text[], integer[], integer), public.adv_pack(text, text[]),
  public.adv_q_lower(integer), public.adv_q_upper(integer), public.adv_q_uni(integer), public.adv_seconds(text)
  from public, anon, authenticated;
revoke execute on function public.adv_start(text, text, integer), public.adv_ask(uuid, integer), public.adv_answer(uuid, integer),
  public.adv_quit(uuid), public.adv_leaderboard(text) from public, anon;
grant execute on function public.adv_start(text, text, integer), public.adv_ask(uuid, integer), public.adv_answer(uuid, integer),
  public.adv_quit(uuid), public.adv_leaderboard(text) to authenticated;
