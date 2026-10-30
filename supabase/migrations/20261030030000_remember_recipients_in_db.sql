-- Remember the recipient of an order in the sender's address book, in the database (2026-10-30).
--
-- Until early October tilda-webhook did this itself (block "ЗАПОМИНАЕМ ПОЛУЧАТЕЛЯ"), but the
-- "gift without address" deploy shipped a webhook version without that block, so since then
-- no recipient was saved (Yehor Filipchuk 20.10, Darja Zabijaka 8.10, ...). Like the gift
-- logic (zz_gift_orders_*), it now lives in a trigger, so a webhook redeploy cannot lose it.
--
-- Same rules as the webhook had, plus a first-name check:
--  * only when the "recipient is me" box was not ticked (recipient-customer <> 'yes')
--    and the recipient's name differs from the buyer's;
--  * one address-book entry per sender e-mail + recipient name (no duplicates on repeats);
--  * the delivery date becomes a yearly reminder for that person (once per date).
-- A gift without address has only a placeholder address, so no address is stored for it.
-- Errors never block saving the order (a warning goes to the log instead).

create or replace function public.remember_recipient_from_order(o public.tilda_orders)
returns void language plpgsql security definer set search_path = public as $$
declare
  p jsonb := o.raw_payload;
  v_email text := lower(btrim(coalesce(o.customer_email, '')));
  v_name text; v_buyer text; v_addr text; v_phone text; v_id uuid; v_day date;
begin
  if v_email = '' or p is null then return; end if;
  if coalesce(p->>'recipient-customer', '') = 'yes' then return; end if;
  if coalesce(o.status::text, '') = 'cancelled' then return; end if;

  v_name := btrim(concat_ws(' ', nullif(btrim(p->>'recipients-name'), ''), nullif(btrim(p->>'recipients-lastname'), '')));
  if v_name = '' then return; end if;
  v_buyer := btrim(concat_ws(' ', nullif(btrim(p->>'name'), ''), nullif(btrim(coalesce(p->>'lastname', p->>'last-name')), '')));
  if lower(v_name) = lower(v_buyer) then return; end if;
  -- same first name as the buyer = the buyer (Tilda fills e.g. Max + Max when the box is left unticked)
  if lower(btrim(coalesce(p->>'recipients-name', ''))) = lower(btrim(coalesce(p->>'name', ''))) then return; end if;

  v_phone := nullif(btrim(p->>'recipients-phone-number'), '');
  v_addr := nullif(concat_ws(', ', nullif(btrim(p->>'adres'), ''), nullif(btrim(p->>'city'), ''), nullif(btrim(p->>'psc'), '')), '');
  -- gift without address: the address is the recipient's own secret (or a placeholder), the sender never gets it
  if coalesce(o.gift_status, '') <> '' or lower(coalesce(p->>'gift-no-address', '')) = 'yes' then v_addr := null; end if;

  select id into v_id from recipients where lower(owner_email) = v_email and lower(name) = lower(v_name) limit 1;
  if v_id is null then
    insert into recipients (owner_email, name, phone, address, address_lat, address_lng)
    values (v_email, v_name, v_phone, v_addr,
            case when v_addr is not null then o.recipient_lat end,
            case when v_addr is not null then o.recipient_lng end)
    returning id into v_id;
  else
    -- fill only what is still empty; what the customer edited in the account stays
    update recipients set
      phone = coalesce(phone, v_phone),
      address = coalesce(address, v_addr),
      address_lat = coalesce(address_lat, case when address is null and v_addr is not null then o.recipient_lat end),
      address_lng = coalesce(address_lng, case when address is null and v_addr is not null then o.recipient_lng end)
    where id = v_id;
  end if;

  v_day := (o.delivery_date at time zone 'Europe/Prague')::date;
  if v_day is not null then
    insert into personal_dates (email, label, event_date, recurrence, recipient_id)
    select v_email, v_name, v_day, 'yearly', v_id
    where not exists (select 1 from personal_dates d where d.recipient_id = v_id and d.event_date = v_day);
  end if;
end $$;
revoke execute on function public.remember_recipient_from_order(public.tilda_orders) from public, anon, authenticated;

create or replace function public.trg_remember_order_recipient() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform remember_recipient_from_order(new);
  exception when others then
    raise warning 'remember_recipient_from_order(%): %', new.order_id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists zz_remember_order_recipient on public.tilda_orders;
create trigger zz_remember_order_recipient
  after insert or update of raw_payload on public.tilda_orders
  for each row execute function trg_remember_order_recipient();

-- one-off: the orders the webhook skipped (the feature exists since 2026-09-03; repeats are harmless)
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
