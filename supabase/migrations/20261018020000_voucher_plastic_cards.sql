-- Poukaz mozhet byt elektronnym ili plastikovoj kartoj (opciya "Typ" u tovara v Tilda).
--  * elektronnyj: vypuskaetsya avtomaticheski posle oplaty (kak ranshe);
--  * plastikovaya karta: obychnyj tovar s dostavkoj/samovyvozom, avtomaticheski nichego ne vypuskaetsya,
--    menedzheru prikhodit soobshchenie v Telegram: vydat kartu i vklyuchit ee po kodu (email pokupatelya).

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
    if coalesce(prod->>'name', '') ilike '%poukaz%' and prod::text !~* 'plastov' then vs := vs + line; else os := os + line; end if;
  end loop;
  voucher_sum := vs; other_sum := os;
  return next;
end;
$function$;

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
    if coalesce(prod->>'name', '') ilike '%poukaz%' and prod::text !~* 'plastov' then
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
  if coalesce(s.other_sum, 0) <= 0 and coalesce(d->>'voucher-delivery', '') <> 'yes' then
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


create or replace function public.voucher_orders_after()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  prod jsonb;
  p_cnt int := 0;
  p_total numeric := 0;
  qty int;
begin
  if NEW.payment_status::text like '%Оплачено%' then
    if TG_OP = 'UPDATE' then
      if OLD.payment_status is not distinct from NEW.payment_status then return NEW; end if;
    end if;
    if jsonb_typeof(NEW.raw_payload->'payment'->'products') = 'array' then
      for prod in select * from jsonb_array_elements(NEW.raw_payload->'payment'->'products') loop
        if coalesce(prod->>'name', '') ilike '%poukaz%' and prod::text ~* 'plastov' then
          qty := greatest(coalesce(nullif(regexp_replace(coalesce(prod->>'quantity', ''), '[^0-9]', '', 'g'), '')::int, 1), 1);
          p_cnt := p_cnt + qty;
          p_total := p_total + coalesce(nullif(regexp_replace(coalesce(prod->>'amount', ''), '[^0-9.]', '', 'g'), '')::numeric, 0);
        end if;
      end loop;
    end if;
    if p_cnt > 0 then
      perform notify_telegram_role('manager',
        '💳 Куплена пластиковая карточка: ' || p_cnt || ' шт. на ' || p_total::int || ' Kč (заказ <code>' || NEW.order_id ||
        '</code>, покупатель ' || coalesce(NEW.customer_email, '?') ||
        '). Вручите карточку клиенту (доставка или самовывоз) и включите её по коду в «Сертификаты», указав этот email покупателя.');
    end if;
    if exists (select 1 from voucher_split(NEW.raw_payload) s where s.voucher_sum > 0) then
      perform issue_vouchers_for_order(NEW.order_id);
    end if;
  end if;
  return NEW;
end;
$function$;


revoke all on function public.issue_vouchers_for_order(text) from public, anon, authenticated;
grant execute on function public.issue_vouchers_for_order(text) to service_role;
