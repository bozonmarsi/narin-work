-- Akce: doručení kytic zdarma (košík jen z kytic, objednávky do 7. 12. 2026).
-- Pokladna /payment v takovém případě posílá cenu doručení 0 Kč. Kontrola
-- tg_check_delivery_fee by jinak u každé takové objednávky poslala do Telegramu
-- "Доставка недоплачена". Kytice poznáme podle názvu produktu v objednávce
-- (jména hrdinek z knih, stejný seznam jako v pokladně).
CREATE OR REPLACE FUNCTION public.bouquets_only(p_payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_typeof(p_payload->'payment'->'products') = 'array'
    AND jsonb_array_length(p_payload->'payment'->'products') > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload->'payment'->'products') AS p
      WHERE coalesce(p->>'name', '') !~* '^\s*(clara stahlbaum|margarita|anne shirley|matilda wormwood|daisy buchanan|holly golightly|lucy pevensie)\M'
    );
$$;

CREATE OR REPLACE FUNCTION public.tg_check_delivery_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_expected := CASE
    WHEN bouquets_only(NEW.raw_payload) AND coalesce(NEW.created_at, now()) < timestamptz '2026-12-08 00:00 Europe/Prague' THEN 0
    ELSE e.fee
  END;

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
