-- Dostavka po rasstoyaniyu: novyj sklad + kontrol posle zakaza.
--
-- 1) Sklad (tochka otscheta dlya rasstoyaniya i marshrutov kurera):
--    Na Hroude 63, 100 00 Praha 10.
-- 2) Na stranice oplaty cena dostavki schitaetsya po rasstoyaniyu po pryamoj ot
--    sklada: 159 Kc dostavka + 80 Kc servisnyj sbor, do 17 km edinaya cena,
--    dalshe +30 Kc za kazhdyj nachatyj km, dalshe 40 km kurerom ne vozim
--    (skript tilda/blocks/delivery-distance-pricing.html). Eti zhe chisla zdes -
--    menyat vsegda vmeste.
-- 3) Zashchita ot oshibki/obkhoda skripta: posle sozdaniya kurerskogo zakaza
--    schitaem ozhidaemuyu cenu po koordinatam i, esli klient zaplatil menshe
--    ili adres slishkom dalekij, srazu pishem menedzheram v Telegram.

UPDATE warehouse_location
SET address = 'Na Hroudě 63, 100 00 Praha 10',
    lat = 50.0710426,
    lng = 14.4883401,
    updated_at = now()
WHERE id = true;

CREATE OR REPLACE FUNCTION public.expected_delivery_fee(p_lat double precision, p_lng double precision)
 RETURNS TABLE(km numeric, fee numeric, too_far boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  c_base constant numeric := 159;
  c_service constant numeric := 80;
  c_radius constant numeric := 17;
  c_per_km constant numeric := 30;
  c_max constant numeric := 40;
  w record;
  v_km numeric;
BEGIN
  SELECT lat, lng INTO w FROM warehouse_location WHERE id = true;
  -- haversine, R = 6371 km
  v_km := 2 * 6371 * asin(sqrt(
    power(sin(radians(p_lat - w.lat) / 2), 2) +
    cos(radians(w.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - w.lng) / 2), 2)
  ));
  km := round(v_km, 1);
  too_far := v_km > c_max;
  fee := c_base + c_service + CASE WHEN v_km > c_radius THEN ceil(v_km - c_radius) * c_per_km ELSE 0 END;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_check_delivery_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e record;
  v_paid numeric;
BEGIN
  IF coalesce(NEW.delivery_type, '') NOT ILIKE '%kurýrem%' THEN RETURN NEW; END IF;
  IF NEW.recipient_lat IS NULL OR NEW.recipient_lng IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.gift_status::text, '') <> '' THEN RETURN NEW; END IF;

  SELECT * INTO e FROM expected_delivery_fee(NEW.recipient_lat, NEW.recipient_lng);
  v_paid := nullif(NEW.raw_payload->'payment'->>'delivery_price', '')::numeric;

  IF e.too_far THEN
    PERFORM notify_telegram_role('manager',
      '🚫 <b>Заказ далеко за зоной</b> <code>' || coalesce(NEW.order_id, '?') || '</code>: ' ||
      coalesce(NEW.address, '') || ', ' || coalesce(NEW.city, '') || ' — ' || e.km || ' км от склада. ' ||
      'Клиент заплатил за доставку ' || coalesce(v_paid::text, '?') || ' Kč. Свяжитесь с клиентом (доплата или отмена).');
  ELSIF v_paid IS NOT NULL AND v_paid + 1 < e.fee THEN
    PERFORM notify_telegram_role('manager',
      '⚠️ <b>Доставка недоплачена</b> <code>' || coalesce(NEW.order_id, '?') || '</code>: ' ||
      coalesce(NEW.address, '') || ', ' || coalesce(NEW.city, '') || ' — ' || e.km || ' км от склада. ' ||
      'Клиент заплатил ' || v_paid::int || ' Kč, по расстоянию должно быть ' || e.fee::int || ' Kč (разница ' || (e.fee - v_paid)::int || ' Kč).');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_check_delivery_fee ON tilda_orders;
CREATE TRIGGER trigger_check_delivery_fee
AFTER INSERT ON tilda_orders
FOR EACH ROW
EXECUTE FUNCTION tg_check_delivery_fee();
