-- Zakaz tolko iz plastikovykh poukazov-kart: servisnyj sbor 80 Kc ne beretsya (korzina stavit dostavku bez nego),
-- poetomu proverka "dostavka nedoplachena" dolzhna zhdat summu bez 80.

create or replace function public.cards_only(p_payload jsonb)
 returns boolean
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  prod jsonb;
  n int := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload->'payment'->'products') <> 'array' then return false; end if;
  for prod in select * from jsonb_array_elements(p_payload->'payment'->'products') loop
    n := n + 1;
    if not (coalesce(prod->>'name', '') ilike '%poukaz%' and prod::text ~* 'plastov|card-') then return false; end if;
  end loop;
  return n > 0;
end;
$function$;

create or replace function public.tg_check_delivery_fee()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e record;
  v_paid numeric;
  v_expected numeric;
begin
  IF coalesce(NEW.delivery_type, '') NOT ILIKE '%kurýrem%' THEN RETURN NEW; END IF;
  IF NEW.recipient_lat IS NULL OR NEW.recipient_lng IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.gift_status::text, '') <> '' THEN RETURN NEW; END IF;

  SELECT * INTO e FROM expected_delivery_fee(NEW.recipient_lat, NEW.recipient_lng);
  v_paid := nullif(NEW.raw_payload->'payment'->>'delivery_price', '')::numeric;
  v_expected := e.fee - CASE WHEN cards_only(NEW.raw_payload) THEN 80 ELSE 0 END;

  IF e.too_far THEN
    PERFORM notify_telegram_role('manager',
      '🚫 <b>Заказ далеко за зоной</b> <code>' || coalesce(NEW.order_id, '?') || '</code>: ' ||
      coalesce(NEW.address, '') || ', ' || coalesce(NEW.city, '') || ' — ' || e.km || ' км от склада. ' ||
      'Клиент заплатил за доставку ' || coalesce(v_paid::text, '?') || ' Kč. Свяжитесь с клиентом (доплата или отмена).');
  ELSIF v_paid IS NOT NULL AND v_paid + 1 < v_expected THEN
    PERFORM notify_telegram_role('manager',
      '⚠️ <b>Доставка недоплачена</b> <code>' || coalesce(NEW.order_id, '?') || '</code>: ' ||
      coalesce(NEW.address, '') || ', ' || coalesce(NEW.city, '') || ' — ' || e.km || ' км от склада. ' ||
      'Клиент заплатил ' || v_paid::int || ' Kč, по расстоянию должно быть ' || v_expected::int || ' Kč (разница ' || (v_expected - v_paid)::int || ' Kč).');
  END IF;
  RETURN NEW;
END;
$function$;
