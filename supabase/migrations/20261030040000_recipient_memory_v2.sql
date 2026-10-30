-- Recipient memory v2 (2026-10-30). Replaces remember_recipient_from_order from 20261030030000.
--
-- What changes:
--  * The same person is recognised by phone number too, and ignoring case and diacritics, so
--    "Máma" / "Mama", or "Anastasia" followed by "Anastasia Tilly" with the same phone, stay one card.
--  * A person the customer has edited in the account (owner_edited) is never overwritten by an order,
--    only empty fields are filled. A person saved automatically stays fresh: the latest phone and the
--    latest courier address win (people move, numbers change).
--  * The address is stored only for courier deliveries (never a pickup, never a gift without address),
--    and a gift keeps the recipient's address out of the sender's book.
--  * An order for yourself is remembered as one special entry "Já" (relation 'ja'): your name, phone and the
--    latest courier address, so "Pro mě" can fill the address next time. It never gets reminders.
--    The buyer is never saved as a recipient of his own: same name = self, same phone but another name = skipped.
--  * "-" as a surname (the checkout sends it when a saved person has a single name) is not part of the name.
--  * One yearly reminder per occasion: no second reminder within 3 days of an existing one.
--  * Coordinates that arrive after the order (geocoding) are picked up too.
-- Safe to run twice.

-- ------------------------------------------------------------------ flags
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'recipients' and column_name = 'owner_edited') then
    alter table public.recipients add column owner_edited boolean not null default false;
    alter table public.recipients add column auto_saved boolean not null default false;
    -- everything that existed before counts as touched by the customer; rows made by the first
    -- version of the memory (today's backfill) stay automatic
    update public.recipients set owner_edited = true where created_at < '2026-10-30';
    update public.recipients set auto_saved = true where created_at >= '2026-10-30';
  end if;
end $$;

create or replace function public.recipient_key(t text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t, '')), 'áäâčďéěëíîňóöôřšťúůüûýž', 'aaacdeeeiinooorstuuuuyz'),
    '\s+', ' ', 'g'))
$$;

create or replace function public.phone_key(t text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 9
              then right(regexp_replace(t, '\D', '', 'g'), 9) end
$$;

-- who is touching the row: our function sets narin.auto_recipient, anything else is the customer
create or replace function public.trg_recipient_owner_flag() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('narin.auto_recipient', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_edited := true; new.auto_saved := false;
  elsif (new.name, new.phone, new.address, new.relation) is distinct from (old.name, old.phone, old.address, old.relation) then
    new.owner_edited := true;
  end if;
  return new;
end $$;

drop trigger if exists recipients_owner_flag on public.recipients;
create trigger recipients_owner_flag before insert or update on public.recipients
  for each row execute function public.trg_recipient_owner_flag();

-- ------------------------------------------------------------------ the memory
create or replace function public.remember_recipient_from_order(o public.tilda_orders)
returns void language plpgsql security definer set search_path = public as $$
declare
  p jsonb := o.raw_payload;
  v_email text := lower(btrim(coalesce(o.customer_email, '')));
  v_first text; v_last text; v_name text;
  v_buyer text; v_buyer_name text; v_self boolean; v_pkey text; v_buyer_pkey text; v_phone text;
  v_addr text; v_lat float8; v_lng float8;
  v_id uuid; v_day date; r public.recipients;
begin
  if v_email = '' or p is null then return; end if;
  if coalesce(o.status::text, '') = 'cancelled' then return; end if;

  v_first := nullif(btrim(p->>'recipients-name'), '');
  v_last := nullif(btrim(coalesce(p->>'recipients-lastname', '')), '');
  if v_last in ('-', '–', '—', '.') then v_last := null; end if;
  if v_first is null then return; end if;
  v_name := concat_ws(' ', v_first, v_last);

  -- the buyer himself: the same full name = an order for himself ("Pro mě")
  v_buyer_name := nullif(btrim(concat_ws(' ', nullif(btrim(coalesce(o.customer_name, p->>'name')), ''),
                                              nullif(btrim(coalesce(o.customer_last_name, p->>'last-name', p->>'lastname')), ''))), '');
  v_buyer := recipient_key(v_buyer_name);
  v_self := recipient_key(v_name) = v_buyer;
  v_phone := nullif(btrim(p->>'recipients-phone-number'), '');
  v_pkey := phone_key(v_phone);
  v_buyer_pkey := phone_key(coalesce(o.customer_phone, p->>'phone'));
  -- ambiguous (ticked "same as customer" with another name, or the buyer's own phone under another name): remember nothing
  if not v_self and (coalesce(p->>'recipient-customer', '') = 'yes' or (v_pkey is not null and v_pkey = v_buyer_pkey)) then return; end if;

  -- the address: courier deliveries only, never a gift without address
  if coalesce(o.delivery_type, p->>'delivery', '') ilike '%kur%'
     and coalesce(o.gift_status, '') = '' and lower(coalesce(p->>'gift-no-address', '')) <> 'yes' then
    v_addr := nullif(concat_ws(', ', nullif(btrim(p->>'adres'), ''), nullif(btrim(p->>'city'), ''), nullif(btrim(p->>'psc'), '')), '');
    if nullif(btrim(p->>'adres'), '') is null then v_addr := null; end if;
    if v_addr is not null then v_lat := o.recipient_lat; v_lng := o.recipient_lng; end if;
  end if;

  perform set_config('narin.auto_recipient', '1', true);

  if v_self then
    -- an order for yourself: only worth remembering when it has a courier address
    if v_addr is null then perform set_config('narin.auto_recipient', '', true); return; end if;
    v_phone := coalesce(v_phone, nullif(btrim(coalesce(o.customer_phone, p->>'phone')), ''));
    select * into r from recipients where lower(owner_email) = v_email and relation = 'ja' order by owner_edited desc, created_at limit 1;
    if not found then
      insert into recipients (owner_email, name, relation, phone, address, address_lat, address_lng, auto_saved, owner_edited)
      values (v_email, v_buyer_name, 'ja', v_phone, v_addr, v_lat, v_lng, true, false);
    elsif r.owner_edited then
      update recipients set phone = coalesce(phone, v_phone), address = coalesce(address, v_addr),
        address_lat = case when address is null then v_lat else address_lat end,
        address_lng = case when address is null then v_lng else address_lng end
      where id = r.id;
    else
      update recipients set name = v_buyer_name, phone = coalesce(v_phone, phone), address = v_addr,
        address_lat = case when v_lat is not null or v_addr is distinct from address then v_lat else address_lat end,
        address_lng = case when v_lng is not null or v_addr is distinct from address then v_lng else address_lng end
      where id = r.id;
    end if;
    perform set_config('narin.auto_recipient', '', true);
    return;
  end if;

  -- find the person: full name, else phone, else the same first name saved without a surname
  select * into r from recipients where lower(owner_email) = v_email and coalesce(relation, '') <> 'ja' and recipient_key(name) = recipient_key(v_name) order by owner_edited desc, created_at limit 1;
  if not found and v_pkey is not null then
    select * into r from recipients where lower(owner_email) = v_email and coalesce(relation, '') <> 'ja' and phone_key(phone) = v_pkey order by owner_edited desc, created_at limit 1;
  end if;
  if not found and v_last is not null then
    select * into r from recipients where lower(owner_email) = v_email and coalesce(relation, '') <> 'ja' and recipient_key(name) = recipient_key(v_first)
       and (phone is null or v_pkey is null or phone_key(phone) = v_pkey) order by owner_edited desc, created_at limit 1;
  end if;

  if r.id is null then
    insert into recipients (owner_email, name, phone, address, address_lat, address_lng, auto_saved, owner_edited)
    values (v_email, v_name, v_phone, v_addr, v_lat, v_lng, true, false)
    returning id into v_id;
  else
    v_id := r.id;
    if r.owner_edited then
      -- the customer keeps what he wrote; only gaps are filled
      update recipients set
        phone = coalesce(phone, v_phone),
        address = coalesce(address, v_addr),
        address_lat = case when address is null and v_addr is not null then v_lat else address_lat end,
        address_lng = case when address is null and v_addr is not null then v_lng else address_lng end
      where id = v_id;
    else
      update recipients set
        name = case when v_last is not null and recipient_key(name) = recipient_key(v_first) then v_name else name end,
        phone = coalesce(v_phone, phone),
        address = coalesce(v_addr, address),
        address_lat = case when v_addr is not null and (v_lat is not null or v_addr is distinct from address) then v_lat else address_lat end,
        address_lng = case when v_addr is not null and (v_lng is not null or v_addr is distinct from address) then v_lng else address_lng end
      where id = v_id;
    end if;
  end if;

  -- one yearly reminder per occasion (not a second one within 3 days)
  v_day := (o.delivery_date at time zone 'Europe/Prague')::date;
  if v_day is not null and not exists (
       select 1 from personal_dates d where d.recipient_id = v_id
          and abs(extract(doy from d.event_date)::int - extract(doy from v_day)::int) <= 3) then
    insert into personal_dates (email, label, event_date, recurrence, recipient_id)
    values (v_email, coalesce((select name from recipients where id = v_id), v_name), v_day, 'yearly', v_id);
  end if;

  perform set_config('narin.auto_recipient', '', true);
end $$;
revoke execute on function public.remember_recipient_from_order(public.tilda_orders) from public, anon, authenticated;

drop trigger if exists zz_remember_order_recipient on public.tilda_orders;
create trigger zz_remember_order_recipient
  after insert or update of raw_payload, recipient_lat, recipient_lng on public.tilda_orders
  for each row execute function public.trg_remember_order_recipient();

-- run the new rules over the orders since the feature started (repeats are harmless)
do $$
declare o public.tilda_orders;
begin
  for o in select * from public.tilda_orders where created_at >= '2026-09-03' order by created_at loop
    begin
      perform public.remember_recipient_from_order(o);
    exception when others then
      raise warning 'backfill %: %', o.order_id, sqlerrm;
    end;
  end loop;
end $$;
