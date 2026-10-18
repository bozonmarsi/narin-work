-- Oplata objednavky depozitem (2026-10-19).
-- Predpoklada migraci 20261019000000_catalog_prices (ceny kontroluje checkout-order).
--
-- Pravila (utverzhdeny 2026-10-19):
--  * Depozit ILI body, ne oboje (kontroluet stranka oplaty).
--  * Depozitem lze zaplatit cely zakaz vcetne dopravy a servisniho poplatku;
--    pokud depozit nestaci, zbytek se plati kartou (Stripe).
--  * Cashback se pocita z cele sumy zakazu (i z casti zaplacene depozitem).
--  * Depozit se NEVRACI na ucet: pri zruseni zakazu se nic nevraci automaticky.
--  * Depozit se odepisuje v okamziku, kdy je zakaz skutecne zaplacen
--    (cely depozitem = hned; cast kartou = po potvrzeni Stripe). Pokud zakaznik
--    kartu nedokonci, depozit se nedotkne - proto neni potreba zadny vraceci
--    mechanismus.
--  * Odepisuje se z partii, ktere shori driv (trigger customer_deposits ->
--    deposit_lots uz to dela pro kazdy mensi balance).

-- 1. nove sloupce na zakazu
alter table tilda_orders add column if not exists pending_deposit numeric default 0;
alter table tilda_orders add column if not exists checkout_source text;
alter table tilda_orders add column if not exists stripe_session_id text;
alter table tilda_orders add column if not exists checkout_key text;

-- jeden klic = jeden zakaz (ochrana proti dvojitemu kliknuti / opakovani)
create unique index if not exists tilda_orders_checkout_key_idx
  on tilda_orders (checkout_key) where checkout_key is not null;

-- 2. zaplaceni zakazu: odepsat depozit + oznacit "Oplaceno" (idempotentne)
-- Vola edge funkce checkout-order (cely depozitem) a Stripe webhook
-- rapid-processor (po potvrzeni platby). Pro zakazy bez depozitu se jen
-- zmeni stav - stejne jako dosud delal webhook.
create or replace function public.settle_order_payment(p_order_id text)
 returns table(result text, spent numeric, shortfall numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o tilda_orders;
  v_email text;
  v_pending numeric;
  v_balance numeric;
  v_spend numeric := 0;
begin
  select * into o from tilda_orders where order_id = p_order_id for update;
  if not found then
    return query select 'not_found'::text, 0::numeric, 0::numeric;
    return;
  end if;

  if coalesce(o.payment_status::text, '') like '%Оплачено%' then
    return query select 'already_paid'::text, coalesce(o.used_deposit, 0), 0::numeric;
    return;
  end if;

  v_pending := coalesce(o.pending_deposit, 0);
  if v_pending > 0 then
    v_email := lower(btrim(coalesce(o.customer_email, '')));
    select balance into v_balance
      from customer_deposits
     where lower(email) = v_email
     for update;
    v_spend := least(v_pending, greatest(coalesce(v_balance, 0), 0));

    if v_spend > 0 then
      update customer_deposits
         set balance = balance - v_spend, updated_at = now()
       where lower(email) = v_email;
      insert into deposit_transactions (user_email, amount, type, order_id, description)
      values (v_email, -v_spend, 'order', p_order_id, 'Platba objednávky ' || p_order_id)
      on conflict do nothing;
    end if;

    -- zustatek mezitim klesl (druhy zakaz): zaplaceno kartou, depozitu chybi
    if v_spend < v_pending then
      perform notify_telegram_role('manager',
        '⚠️ <b>Депозит списан не полностью</b> <code>' || p_order_id || '</code>: ' ||
        'нужно было ' || v_pending::int || ' Kč, на депозите оказалось ' || v_spend::int ||
        ' Kč. Клиент оплатил карту, разницу (' || (v_pending - v_spend)::int || ' Kč) нужно решить вручную.');
    end if;
  end if;

  update tilda_orders
     set payment_status = '🟢 Оплачено',
         used_deposit = v_spend,
         pending_deposit = 0
   where id = o.id;

  return query select 'paid'::text, v_spend, greatest(v_pending - v_spend, 0);
end;
$function$;

revoke all on function public.settle_order_payment(text) from public, anon, authenticated;
grant execute on function public.settle_order_payment(text) to service_role;
