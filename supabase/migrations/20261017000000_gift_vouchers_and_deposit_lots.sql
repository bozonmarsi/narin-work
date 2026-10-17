-- Darkove poukazy (kartichki s unikalnym kodom) + depozit s sgoraniem.
--
-- Pravila (utverzhdeny 2026-10-17):
--  * Karta pechataetsya s unikalnym kodom, do prodazhi "neaktivna". Menedzher
--    vklyuchaet kartu po kodu (activate_voucher): summa i sposob oplaty,
--    s etogo momenta srok 12 mesyacev.
--  * Klient skaniruet QR / vvodit kod -> summa srazu zachislyaetsya na ego
--    depozit (claim_voucher), odin raz.
--  * Den'gi na depozite ot poukaza sgorayut v tot zhe den, chto i sama karta
--    (aktivaciya + 12 mesyacev), a ne cherez 12 mesyacev posle skanirovaniya.
--  * Ruchnye popolneniya menedzherom - bez sroka.
--
-- Depozit teper hranitsya "partiyami" (deposit_lots), u kazhdoj svoya data
-- sgoraniya. customer_deposits.balance ostalsya summoj (chitayut ego sajt i
-- prilozhenie), a lyuboe pryamoe izmenenie balance (stranica "Klienty",
-- avtozakazy Occasions) trigger perenosit v partii: plyus = novaya partiya bez
-- sroka, minus = spisanie iz partii, kotorye sgoryat ran'she.

-- 0. zhurnal depozita (ranshe migraciya ne byla primenena v boyu)
create table if not exists deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  amount numeric not null,
  type text not null,
  order_id text,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists deposit_transactions_email_idx on deposit_transactions (lower(user_email));
create unique index if not exists deposit_transactions_unique_order_type
  on deposit_transactions (order_id, type) where order_id is not null and order_id <> '';
alter table deposit_transactions enable row level security;
drop policy if exists "manager_all_deposit_transactions" on deposit_transactions;
create policy "manager_all_deposit_transactions" on deposit_transactions for all using (is_manager());
alter table tilda_orders add column if not exists used_deposit numeric default 0;

-- 1. partii depozita
create table if not exists deposit_lots (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  amount numeric not null check (amount > 0),
  remaining numeric not null check (remaining >= 0),
  source text not null default 'manual' check (source in ('manual', 'voucher')),
  source_ref text,
  expires_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists deposit_lots_email_idx on deposit_lots (lower(email), expires_at);
alter table deposit_lots enable row level security;
drop policy if exists "manager_all_deposit_lots" on deposit_lots;
create policy "manager_all_deposit_lots" on deposit_lots for all using (is_manager());

-- sushchestvuyushchie ostatki stanovyatsya partiyami bez sroka (odin raz)
insert into deposit_lots (email, amount, remaining, source, source_ref)
select lower(d.email), d.balance, d.balance, 'manual', 'migrated'
from customer_deposits d
where d.balance > 0
  and not exists (select 1 from deposit_lots l where lower(l.email) = lower(d.email));

-- 2. pryamye pravki balance -> partii
create or replace function public.tg_customer_deposits_to_lots()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_delta numeric;
  v_left numeric;
  v_take numeric;
  r record;
begin
  if coalesce(current_setting('narin.lot_sync', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_delta := new.balance;
  else
    v_delta := new.balance - old.balance;
  end if;

  if v_delta > 0 then
    insert into deposit_lots (email, amount, remaining, source, source_ref)
    values (lower(new.email), v_delta, v_delta, 'manual', 'balance edit');
  elsif v_delta < 0 then
    v_left := -v_delta;
    for r in
      select id, remaining from deposit_lots
      where lower(email) = lower(new.email) and remaining > 0 and expired_at is null
      order by expires_at nulls last, created_at
      for update
    loop
      exit when v_left <= 0;
      v_take := least(r.remaining, v_left);
      update deposit_lots set remaining = remaining - v_take where id = r.id;
      v_left := v_left - v_take;
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists trigger_customer_deposits_to_lots on customer_deposits;
create trigger trigger_customer_deposits_to_lots
after insert or update of balance on customer_deposits
for each row
execute function public.tg_customer_deposits_to_lots();

-- 3. poukazy
create table if not exists gift_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  code_key text generated always as (replace(code, '-', '')) stored,
  amount numeric check (amount is null or amount > 0),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'claimed', 'expired', 'void')),
  batch text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  activated_at timestamptz,
  activated_by uuid,
  activation_method text,
  purchaser_email text,
  recipient_email text,
  recipient_name text,
  message text,
  send_at timestamptz,
  order_id text,
  expires_at timestamptz,
  claimed_at timestamptz,
  claimed_by_email text,
  void_reason text
);
create unique index if not exists gift_vouchers_code_key_idx on gift_vouchers (code_key);
create index if not exists gift_vouchers_status_idx on gift_vouchers (status, expires_at);
alter table gift_vouchers enable row level security;
drop policy if exists "manager_all_gift_vouchers" on gift_vouchers;
create policy "manager_all_gift_vouchers" on gift_vouchers for all using (is_manager());

-- kod: NR-XXXX-XXXX, alfavit bez pohozhikh simvolov (bez I, L, O, 0, 1)
create or replace function public.gen_voucher_code(p_prefix text)
 returns text
 language plpgsql
 volatile
 set search_path to 'public'
as $function$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  s text := '';
  i int;
begin
  for i in 0..7 loop
    s := s || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return p_prefix || '-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
end;
$function$;

-- vypusk pachki neaktivnykh kart (menedzher)
create or replace function public.create_voucher_batch(p_count int, p_amount numeric default null, p_prefix text default 'NR', p_batch text default null)
 returns table(voucher_code text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  i int := 0;
  v_code text;
  v_batch text := coalesce(nullif(btrim(p_batch), ''), to_char(now() at time zone 'Europe/Prague', 'YYYYMMDD-HH24MI'));
begin
  if not is_manager() then raise exception 'forbidden'; end if;
  if p_count is null or p_count < 1 or p_count > 500 then raise exception 'count_1_500'; end if;
  while i < p_count loop
    v_code := gen_voucher_code(upper(btrim(coalesce(nullif(p_prefix, ''), 'NR'))));
    begin
      insert into gift_vouchers (code, amount, batch, created_by) values (v_code, p_amount, v_batch, auth.uid());
      i := i + 1;
      voucher_code := v_code;
      return next;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$function$;

-- vklyuchenie karty po kodu (menedzher): summa + sposob oplaty, 12 mesyacev
create or replace function public.activate_voucher(p_code text, p_amount numeric default null, p_method text default 'cash', p_purchaser_email text default null, p_note text default null)
 returns gift_vouchers
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v gift_vouchers;
  v_key text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_amount numeric;
begin
  if not is_manager() then raise exception 'forbidden'; end if;
  select * into v from gift_vouchers where code_key = v_key for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if v.status <> 'inactive' then raise exception 'voucher_not_inactive_%', v.status; end if;
  v_amount := coalesce(p_amount, v.amount);
  if v_amount is null or v_amount <= 0 then raise exception 'amount_required'; end if;
  update gift_vouchers
     set amount = v_amount,
         status = 'active',
         activated_at = now(),
         activated_by = auth.uid(),
         activation_method = coalesce(nullif(p_method, ''), 'cash'),
         expires_at = now() + interval '12 months',
         purchaser_email = coalesce(nullif(lower(btrim(coalesce(p_purchaser_email, ''))), ''), purchaser_email),
         note = coalesce(nullif(p_note, ''), note)
   where id = v.id
  returning * into v;
  return v;
end;
$function$;

create or replace function public.void_voucher(p_code text, p_reason text default null)
 returns gift_vouchers
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v gift_vouchers;
  v_key text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
begin
  if not is_manager() then raise exception 'forbidden'; end if;
  select * into v from gift_vouchers where code_key = v_key for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if v.status not in ('inactive', 'active') then raise exception 'voucher_cannot_void_%', v.status; end if;
  update gift_vouchers set status = 'void', void_reason = nullif(p_reason, '') where id = v.id returning * into v;
  return v;
end;
$function$;

-- pogashenie klientom (zovet tolko edge funkciya posle proverki tokena).
-- Vse shagi v odnoj tranzakcii; stroka karty zablokirovana (for update), tak
-- chto vtoroj odnovremennyj zapros zhdet i poluchit "already_claimed".
create or replace function public.claim_voucher(p_email text, p_code text)
 returns table(new_balance numeric, voucher_amount numeric, valid_until timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v gift_vouchers;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_key text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_row_email text;
  v_balance numeric;
begin
  if v_email = '' then raise exception 'email_required'; end if;
  select * into v from gift_vouchers where code_key = v_key for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if v.status = 'claimed' then raise exception 'already_claimed'; end if;
  if v.status <> 'active' then raise exception 'voucher_%', v.status; end if;
  if v.expires_at <= now() then raise exception 'voucher_expired'; end if;

  perform set_config('narin.lot_sync', '1', true);

  insert into deposit_lots (email, amount, remaining, source, source_ref, expires_at)
  values (v_email, v.amount, v.amount, 'voucher', v.code, v.expires_at);

  select email into v_row_email from customer_deposits where lower(email) = v_email limit 1;
  if v_row_email is null then
    insert into customer_deposits (email, balance, updated_at) values (v_email, v.amount, now())
    returning balance into v_balance;
  else
    update customer_deposits set balance = balance + v.amount, updated_at = now()
     where email = v_row_email
    returning balance into v_balance;
  end if;

  insert into deposit_transactions (user_email, amount, type, order_id, description)
  values (v_email, v.amount, 'voucher', 'voucher:' || v.code, 'Dárkový poukaz ' || v.code);

  update gift_vouchers set status = 'claimed', claimed_at = now(), claimed_by_email = v_email where id = v.id;

  perform set_config('narin.lot_sync', '0', true);
  return query select v_balance, v.amount, v.expires_at;
end;
$function$;

-- ezhednevno: sgoranie prosrochennykh partij i prosrochennykh nepogashennykh kart
create or replace function public.expire_deposit_lots()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  n int := 0;
begin
  perform set_config('narin.lot_sync', '1', true);
  for r in
    select id, email, remaining from deposit_lots
    where expires_at is not null and expires_at <= now() and expired_at is null and remaining > 0
    for update skip locked
  loop
    update deposit_lots set expired_at = now(), remaining = 0 where id = r.id;
    update customer_deposits set balance = greatest(balance - r.remaining, 0), updated_at = now()
     where lower(email) = lower(r.email);
    insert into deposit_transactions (user_email, amount, type, order_id, description)
    values (r.email, -r.remaining, 'expired', 'lot:' || r.id, 'Propadl zůstatek z poukazu')
    on conflict do nothing;
    n := n + 1;
  end loop;
  update deposit_lots set expired_at = now()
   where expires_at is not null and expires_at <= now() and expired_at is null and remaining = 0;
  update gift_vouchers set status = 'expired' where status = 'active' and expires_at <= now();
  perform set_config('narin.lot_sync', '0', true);
  return n;
end;
$function$;

revoke all on function public.create_voucher_batch(int, numeric, text, text) from public, anon;
revoke all on function public.activate_voucher(text, numeric, text, text, text) from public, anon;
revoke all on function public.void_voucher(text, text) from public, anon;
grant execute on function public.create_voucher_batch(int, numeric, text, text) to authenticated;
grant execute on function public.activate_voucher(text, numeric, text, text, text) to authenticated;
grant execute on function public.void_voucher(text, text) to authenticated;
revoke all on function public.claim_voucher(text, text) from public, anon, authenticated;
revoke all on function public.expire_deposit_lots() from public, anon, authenticated;
revoke all on function public.gen_voucher_code(text) from public, anon, authenticated;
grant execute on function public.claim_voucher(text, text) to service_role;
grant execute on function public.expire_deposit_lots() to service_role;

select cron.schedule('expire-deposit-lots', '10 0 * * *', $$select public.expire_deposit_lots()$$);
