-- 1) A pickup order is never a "gift without address". Gifts are always delivered by courier
--    (delivery_type contains "kurýr"); pickup orders have only "Servisní poplatek = 80".
--    Order 1446251543 (pickup 24.10 17:30) was turned into a gift by mistake.
-- 2) Put order 1446251543 back to a normal pickup order.

CREATE OR REPLACE FUNCTION public.gift_orders_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ph constant text := 'Adresu zadá příjemce';
BEGIN
  IF NOT (coalesce(NEW.raw_payload->>'gift-no-address', '') = 'yes' OR NEW.address = v_ph) THEN
    RETURN NEW;
  END IF;

  -- samovyzvednuti (delivery_type bez slova kuryr) nikdy neni darek bez adresy
  IF coalesce(NEW.delivery_type, '') <> '' AND NEW.delivery_type !~* 'kur[yý]r'
     AND coalesce(NEW.gift_status::text, '') = '' THEN
    RETURN NEW;
  END IF;

  -- výslovný přechod stavu (gift-link confirm, gift_close) — nesahat
  IF NEW.gift_status IN ('confirmed', 'sender_manual', 'expired', 'opted_out')
     AND (TG_OP = 'INSERT' OR NEW.gift_status IS DISTINCT FROM OLD.gift_status) THEN
    RETURN NEW;
  END IF;

  -- už uzavřený dárek: opakovaný webhook nesmí vrátit zástupnou adresu
  IF TG_OP = 'UPDATE' AND OLD.gift_status IN ('confirmed', 'sender_manual', 'expired', 'opted_out') THEN
    IF coalesce(NEW.address, '') IN (v_ph, '') THEN
      NEW.address := OLD.address; NEW.city := OLD.city; NEW.psk := OLD.psk; NEW.patro := OLD.patro;
      NEW.cislo_bytu := OLD.cislo_bytu; NEW.kod_intercomu := OLD.kod_intercomu;
      NEW.delivery_date := OLD.delivery_date; NEW.delivery_slot := OLD.delivery_slot; NEW.delivery_time_raw := OLD.delivery_time_raw;
      NEW.recipient_lat := OLD.recipient_lat; NEW.recipient_lng := OLD.recipient_lng;
    END IF;
    NEW.gift_status := OLD.gift_status;
    RETURN NEW;
  END IF;

  -- čeká na příjemce: zástupné hodnoty z pokladny pryč
  NEW.address := ''; NEW.city := ''; NEW.psk := ''; NEW.patro := ''; NEW.cislo_bytu := ''; NEW.kod_intercomu := '';
  NEW.delivery_date := NULL; NEW.delivery_slot := ''; NEW.delivery_time_raw := '';
  NEW.recipient_lat := NULL; NEW.recipient_lng := NULL;
  NEW.gift_status := 'awaiting_input';
  IF coalesce(NEW.recipient_name, '') = '' THEN
    NEW.recipient_name := nullif(btrim(NEW.raw_payload->>'gift-recipient-name'), '');
  END IF;
  RETURN NEW;
END $function$;

BEGIN;
DELETE FROM gift_links WHERE order_id = '1446251543';
UPDATE tilda_orders
   SET gift_status = NULL,
       delivery_date = '2026-10-24 00:00:00+00',
       delivery_time_raw = '17:30'
 WHERE order_id = '1446251543';
COMMIT;

SELECT order_id, status, gift_status, delivery_type, delivery_date, delivery_time_raw,
       (SELECT count(*) FROM gift_links WHERE order_id = '1446251543') AS gift_links
  FROM tilda_orders WHERE order_id = '1446251543';
