-- Phase 9: ร้านค้า (แลกเหรียญเป็นสกินอนิเมะ / อัปเกรดถาวรในสนามรบ)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run (ต้องรัน 008 มาก่อน / รันซ้ำได้ไม่พัง)
--
-- ราคาอยู่ในฐานข้อมูลเท่านั้น (เบราว์เซอร์แค่แสดง) ซื้อแล้วตัดเหรียญ + จดลง wallet_log เป็นเหรียญติดลบ
-- และห้ามใส่สกินที่ยังไม่ได้ซื้อ (ตรวจที่ profiles ทุกครั้งที่บันทึกหน้าตา)

create table if not exists public.inventory (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item text not null,
  level integer not null default 1,
  bought_at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table public.inventory enable row level security;
drop policy if exists "ดูของของตัวเอง" on public.inventory;
create policy "ดูของของตัวเอง" on public.inventory for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.inventory from anon, authenticated;
grant select on public.inventory to authenticated;

-- ราคาของชิ้นนี้ที่ระดับ next (null = ไม่มีของนี้ หรือซื้อครบแล้ว) ต้องตรงกับ client/src/lib/shop.ts
create or replace function public.shop_price(p_item text, next integer) returns integer
language sql immutable as $$
  select case
    -- สกินอนิเมะ (id ต้องตรงกับ client/src/lib/skins.ts)
    when p_item in ('skin:sakura', 'skin:hikaru', 'skin:kaito', 'skin:hana', 'skin:midori', 'skin:aoi') and next = 1 then 150
    when p_item in ('skin:yuki', 'skin:kuro', 'skin:shinobu', 'skin:rei') and next = 1 then 400
    when p_item in ('skin:akane', 'skin:ryuo') and next = 1 then 1000
    -- อัปเกรดถาวรในสนามรบ (ราคาขึ้นตามระดับ)
    when p_item = 'up:hp' and next between 1 and 5 then 100 * next
    when p_item = 'up:power' and next between 1 and 5 then 150 * next
    when p_item = 'up:magnet' and next between 1 and 3 then 80 * next
    when p_item = 'up:ult' and next between 1 and 3 then 200 * next
    when p_item = 'up:revive' and next = 1 then 800
  end
$$;

create or replace function public.shop_buy(p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur integer;
  price integer;
  have integer;
begin
  if uid is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  select coins into have from profiles where id = uid for update; -- ล็อกกระเป๋า กดซื้อรัวๆ จะได้ไม่ติดลบ
  if not found then raise exception 'ไม่พบโปรไฟล์'; end if;
  select level into cur from inventory where user_id = uid and item = p_item;
  cur := coalesce(cur, 0);
  price := shop_price(p_item, cur + 1);
  if price is null then
    if cur > 0 then raise exception 'มีของชิ้นนี้ครบแล้ว'; end if;
    raise exception 'ไม่มีของชิ้นนี้ในร้าน';
  end if;
  if have < price then raise exception 'เหรียญไม่พอ (ต้องใช้ % เหรียญ มีอยู่ % เหรียญ)', price, have; end if;

  update profiles set coins = coins - price where id = uid;
  insert into inventory (user_id, item, level) values (uid, p_item, 1)
    on conflict (user_id, item) do update set level = inventory.level + 1, bought_at = now();
  insert into wallet_log (user_id, source, ref, coins, xp, note)
    values (uid, 'shop', p_item || ':' || (cur + 1), -price, 0, 'ซื้อ ' || p_item || case when cur > 0 then ' ขั้น ' || (cur + 1) else '' end);
  return json_build_object('item', p_item, 'level', cur + 1, 'coins', have - price);
end;
$$;

-- ห้ามใส่สกินที่ยังไม่ได้ซื้อ (ตัวละครฟรีใส่ได้ตามเดิม)
create or replace function public.check_skin_owned() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ch text := new.avatar ->> 'character';
begin
  if ch like 'skin-%' and (tg_op = 'INSERT' or ch is distinct from old.avatar ->> 'character')
     and not exists (select 1 from inventory where user_id = new.id and item = 'skin:' || substr(ch, 6)) then
    raise exception 'ยังไม่มีสกินนี้ แลกในร้านค้าก่อนนะ';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_skin_owned on public.profiles;
create trigger profiles_skin_owned before insert or update of avatar on public.profiles
  for each row execute function public.check_skin_owned();

revoke execute on function public.check_skin_owned() from public, anon, authenticated;
revoke execute on function public.shop_buy(text), public.shop_price(text, integer) from public, anon;
grant execute on function public.shop_buy(text), public.shop_price(text, integer) to authenticated;
