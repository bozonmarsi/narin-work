-- Onlajn-prodazha elektronnykh poukazov (sertifikatov).
--
-- Kak eto rabotaet:
--  1. V Tilda est tovar "Darkovy poukaz" (nominal = cena tovara). V korzine
--     (/payment) pokupatel zapolnyaet skrytye polya voucher-recipient-email,
--     voucher-recipient-name, voucher-send-on (data otpravki) i voucher-message;
--     oni popadayut v tilda_orders.raw_payload, webhook menyat ne nado.
--  2. Kak tolko zakaz stanovitsya "Oplacheno" (Stripe, ili menedzher otmetil
--     naličku), trigger vypuskaet poukazy: po odnomu na kazhduyu shtuku,
--     srazu aktivnye (12 mesyacev s oplaty).
--  3. Pokupatelyu uhodit pismo-podtverzhdenie (event voucher_purchased), a
--     poluchatelyu - krasivoe pismo s kartoj (event voucher_gift) v vybrannyj
--     den (v 9:00 po Prage; esli data segodnya ili pustaya - srazu). Esli email
--     poluchatelya ne ukazan, pismo s kartoj poluchaet sam pokupatel.
--  4. Zakaz, v kotorom tolko poukazy, vezti ne nado: delivery_type = 'digital',
--     status srazu 'delivered', pismo klientu "dostavleno" ne shletsya.
--     Keshbek (ochki) za poukazy ne nachislyaetsya.
-- Idempotentno: povtornyj vyzov ne vypustit lishnie poukazy.

alter table gift_vouchers add column if not exists sender_name text;
alter table gift_vouchers add column if not exists sent_at timestamptz;
alter table gift_vouchers add column if not exists order_seq int;
create unique index if not exists gift_vouchers_order_seq_idx on gift_vouchers (order_id, order_seq) where order_id is not null;

-- summy v zakaze: poukazy / ostalnoe (po raw_payload.payment.products)
create or replace function public.voucher_split(p_payload jsonb)
 returns table(voucher_sum numeric, other_sum numeric)
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  prod jsonb;
  line numeric;
  vs numeric := 0;
  os numeric := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload->'payment'->'products') <> 'array' then
    voucher_sum := 0; other_sum := 0; return next; return;
  end if;
  for prod in select * from jsonb_array_elements(p_payload->'payment'->'products') loop
    line := coalesce(
      nullif(regexp_replace(coalesce(prod->>'amount', ''), '[^0-9.]', '', 'g'), '')::numeric,
      nullif(regexp_replace(coalesce(prod->>'price', ''), '[^0-9.]', '', 'g'), '')::numeric * greatest(coalesce(nullif(regexp_replace(coalesce(prod->>'quantity', ''), '[^0-9]', '', 'g'), '')::int, 1), 1),
      0);
    if coalesce(prod->>'name', '') ilike '%poukaz%' then vs := vs + line; else os := os + line; end if;
  end loop;
  voucher_sum := vs; other_sum := os;
  return next;
end;
$function$;

-- BEFORE: keshbek tolko s nepoukazovoj chasti; zakaz tolko iz poukazov - cifrovoj
create or replace function public.voucher_orders_before()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  s record;
begin
  select * into s from voucher_split(NEW.raw_payload);
  if coalesce(s.voucher_sum, 0) > 0 then
    if coalesce(s.other_sum, 0) <= 0 then
      NEW.delivery_type := 'digital';
      NEW.earned_points := 0;
    elsif coalesce(NEW.order_total, 0) > 0 and coalesce(NEW.earned_points, 0) > 0 then
      NEW.earned_points := floor(NEW.earned_points * s.other_sum / greatest(s.other_sum + s.voucher_sum, 1));
    end if;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists aa_voucher_orders_before on tilda_orders;
create trigger aa_voucher_orders_before
before insert or update of raw_payload on tilda_orders
for each row execute function public.voucher_orders_before();

-- pismo poluchatelyu (ili pokupatelyu, esli poluchatel ne ukazan); pomechaet sent_at do otpravki
create or replace function public.send_voucher_email(p_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v gift_vouchers;
begin
  select * into v from gift_vouchers where id = p_id for update;
  if not found or v.sent_at is not null or v.status <> 'active' then return false; end if;
  if coalesce(v.recipient_email, v.purchaser_email, '') not like '%@%' then return false; end if;
  update gift_vouchers set sent_at = now() where id = v.id;
  perform notify_brevo(jsonb_build_object(
    'event', 'voucher_gift',
    'email', coalesce(nullif(v.recipient_email, ''), v.purchaser_email),
    'code', v.code,
    'amount', v.amount,
    'expires_at', v.expires_at,
    'sender_name', case when nullif(v.recipient_email, '') is null then null else v.sender_name end,
    'recipient_name', v.recipient_name,
    'message', v.message,
    'self', nullif(v.recipient_email, '') is null,
    'order_id', v.order_id
  ));
  return true;
end;
$function$;

-- vypusk poukazov po oplachennomu zakazu
create or replace function public.issue_vouchers_for_order(p_order_id text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o tilda_orders;
  d jsonb;
  prod jsonb;
  v gift_vouchers;
  v_price numeric;
  v_qty int;
  i int;
  seq int := 0;
  existing int;
  created int := 0;
  v_rec_email text;
  v_rec_name text;
  v_msg text;
  v_raw text;
  v_send timestamptz := now();
  v_date date;
  v_code text;
  tries int;
  s record;
  v_total numeric := 0;
  v_ids uuid[] := '{}';
begin
  select * into o from tilda_orders where order_id = p_order_id;
  if not found or o.payment_status::text not like '%Оплачено%' then return 0; end if;
  d := o.raw_payload;
  if jsonb_typeof(d->'payment'->'products') <> 'array' then return 0; end if;

  perform pg_advisory_xact_lock(hashtext('voucher_issue:' || o.order_id));
  select count(*) into existing from gift_vouchers where order_id = o.order_id;

  v_rec_email := nullif(lower(btrim(coalesce(d->>'voucher-recipient-email', ''))), '');
  if v_rec_email is not null and (v_rec_email not like '%@%.%' or length(v_rec_email) > 120) then v_rec_email := null; end if;
  v_rec_name := left(nullif(btrim(coalesce(d->>'voucher-recipient-name', '')), ''), 80);
  v_msg := left(nullif(btrim(coalesce(d->>'voucher-message', '')), ''), 500);
  v_raw := btrim(coalesce(d->>'voucher-send-on', ''));
  begin
    if v_raw ~ '^\d{4}-\d{2}-\d{2}$' then v_date := v_raw::date;
    elsif v_raw ~ '^\d{2}[-.]\d{2}[-.]\d{4}$' then v_date := to_date(replace(v_raw, '.', '-'), 'DD-MM-YYYY');
    end if;
  exception when others then v_date := null;
  end;
  if v_date is not null and v_date > (now() at time zone 'Europe/Prague')::date then
    v_send := ((least(v_date, (now() at time zone 'Europe/Prague')::date + 60))::timestamp + interval '9 hours') at time zone 'Europe/Prague';
  end if;

  for prod in select * from jsonb_array_elements(d->'payment'->'products') loop
    if coalesce(prod->>'name', '') ilike '%poukaz%' then
      v_price := nullif(regexp_replace(coalesce(prod->>'price', ''), '[^0-9.]', '', 'g'), '')::numeric;
      v_qty := greatest(coalesce(nullif(regexp_replace(coalesce(prod->>'quantity', ''), '[^0-9]', '', 'g'), '')::int, 1), 1);
      if v_price is null or v_price <= 0 then continue; end if;
      for i in 1..v_qty loop
        seq := seq + 1;
        if seq <= existing then continue; end if;
        tries := 0;
        loop
          tries := tries + 1;
          v_code := gen_voucher_code('NR');
          begin
            insert into gift_vouchers (code, amount, status, batch, activated_at, activation_method, purchaser_email,
                                       recipient_email, recipient_name, sender_name, message, send_at, order_id, order_seq,
                                       expires_at, note)
            values (v_code, v_price, 'active', 'online', now(), 'online', lower(o.customer_email),
                    v_rec_email, v_rec_name, nullif(btrim(concat_ws(' ', d->>'name', d->>'lastname')), ''), v_msg, v_send, o.order_id, seq,
                    now() + interval '12 months', 'Objednavka ' || o.order_id)
            returning * into v;
            exit;
          exception when unique_violation then
            if tries >= 8 then raise; end if;
          end;
        end loop;
        created := created + 1;
        v_total := v_total + v_price;
        v_ids := v_ids || v.id;
      end loop;
    end if;
  end loop;

  if created = 0 then return 0; end if;

  -- zakaz tolko iz poukazov: vezti nechego
  select * into s from voucher_split(d);
  if coalesce(s.other_sum, 0) <= 0 then
    update tilda_orders set status = 'delivered' where id = o.id and status::text not in ('delivered', 'cancelled');
  end if;

  -- podtverzhdenie pokupatelyu
  if coalesce(o.customer_email, '') like '%@%' then
    perform notify_brevo(jsonb_build_object(
      'event', 'voucher_purchased',
      'email', o.customer_email,
      'order_id', o.order_id,
      'count', created,
      'total', v_total,
      'recipient_email', v_rec_email,
      'recipient_name', v_rec_name,
      'send_at', v_send,
      'send_now', v_send <= now() + interval '5 minutes'
    ));
  end if;

  perform notify_telegram_role('manager',
    '🎁 Продан подарочный сертификат: ' || created || ' шт. на ' || v_total::int || ' Kč (заказ <code>' || o.order_id || '</code>), '
    || case when v_rec_email is null then 'письмо уйдёт покупателю' else 'получатель ' || v_rec_email end
    || case when v_send > now() + interval '5 minutes' then ', отправка ' || to_char(v_send at time zone 'Europe/Prague', 'DD.MM HH24:MI') else '' end || '.');

  -- srazu otpravit to, chto uzhe pora
  if v_send <= now() + interval '5 minutes' then
    for i in 1..array_length(v_ids, 1) loop
      perform send_voucher_email(v_ids[i]);
    end loop;
  end if;

  return created;
end;
$function$;

-- trigger: oplata -> vypusk
create or replace function public.voucher_orders_after()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if NEW.payment_status::text like '%Оплачено%' then
    if TG_OP = 'UPDATE' then
      if OLD.payment_status is not distinct from NEW.payment_status then return NEW; end if;
    end if;
    if exists (select 1 from voucher_split(NEW.raw_payload) s where s.voucher_sum > 0) then
      perform issue_vouchers_for_order(NEW.order_id);
    end if;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists zz_voucher_orders_after on tilda_orders;
create trigger zz_voucher_orders_after
after insert or update of payment_status on tilda_orders
for each row execute function public.voucher_orders_after();

-- otlozhennye otpravki: kazhdye 10 minut
create or replace function public.send_due_vouchers()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from gift_vouchers
    where order_id is not null and status = 'active' and sent_at is null and send_at <= now()
    order by send_at
    limit 100
  loop
    if send_voucher_email(r.id) then n := n + 1; end if;
  end loop;
  return n;
end;
$function$;

revoke all on function public.send_voucher_email(uuid) from public, anon, authenticated;
revoke all on function public.issue_vouchers_for_order(text) from public, anon, authenticated;
revoke all on function public.send_due_vouchers() from public, anon, authenticated;
grant execute on function public.send_voucher_email(uuid) to service_role;
grant execute on function public.issue_vouchers_for_order(text) to service_role;
grant execute on function public.send_due_vouchers() to service_role;

select cron.schedule('send-due-vouchers', '*/10 * * * *', $$select public.send_due_vouchers()$$);

-- pismo "dostavleno" ne shlem dlya cifrovykh zakazov (poukazy); ostalnoe bez izmenenij
create or replace function public.tg_notify_customer_brevo()
 returns trigger
 language plpgsql
 security definer
as $function$
declare
  v_is_pickup boolean;
  v_pickup_address text;
  v_common jsonb;
begin
  if NEW.delivery_type = 'digital' then return NEW; end if;

  v_is_pickup := COALESCE(NEW.delivery_type, '') NOT ILIKE '%kurýrem%';

  v_common := jsonb_build_object(
    'order_id', COALESCE(NEW.order_id, NEW.id::text),
    'email', NEW.customer_email,
    'recipient_name', NEW.recipient_name,
    'products_text', NEW.products_text,
    'order_total', NEW.order_total,
    'delivery_date', NEW.delivery_date,
    'delivery_time', COALESCE(NEW.delivery_slot, NEW.delivery_time_raw)
  );

  IF NEW.status = 'confirmed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(v_common || jsonb_build_object(
      'event', CASE WHEN NEW.payment_method = 'stripe' THEN 'order_confirmed_stripe' ELSE 'order_confirmed_cod' END
    ));
  END IF;

  IF NEW.status = 'assembled' AND NEW.status IS DISTINCT FROM OLD.status AND v_is_pickup THEN
    SELECT address INTO v_pickup_address FROM warehouse_location WHERE id = true;
    PERFORM notify_brevo(v_common || jsonb_build_object(
      'event', 'pickup_ready',
      'pickup_address', v_pickup_address
    ));
  END IF;

  IF NEW.status = 'in_transit' AND NEW.status IS DISTINCT FROM OLD.status AND NOT v_is_pickup THEN
    PERFORM notify_brevo(v_common || jsonb_build_object('event', 'courier_out'));
  END IF;

  IF NEW.status = 'delivered' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(v_common || jsonb_build_object('event', 'delivered'));
  END IF;

  IF NEW.status = 'arriving' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(jsonb_build_object(
      'event', 'arriving_sms',
      'order_id', COALESCE(NEW.order_id, NEW.id::text),
      'phone', NEW.recipient_phone
    ));
  END IF;

  IF NEW.status = 'cancelled' AND NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(NEW.customer_email, '') LIKE '%@%'
     AND NOT EXISTS (SELECT 1 FROM gift_links g WHERE g.order_id = NEW.order_id) THEN
    PERFORM notify_brevo(v_common || jsonb_build_object(
      'event', 'order_cancelled',
      'paid', NEW.payment_status::text LIKE '%Оплачено%',
      'pay_method', NEW.payment_method
    ));
  END IF;

  RETURN NEW;
END;
$function$;
