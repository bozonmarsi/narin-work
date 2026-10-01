-- Dárek bez adresy: rozpoznání přímo v databázi (trigger na tilda_orders).
--
-- Proč: v 20261004000000 dárek zakládal tilda-webhook. Když ale edge funkce
-- ještě běží ve staré verzi (nebo skrytá pole z pokladny nedorazí), objednávka
-- přišla jako obyčejná se zástupnou adresou "Adresu zadá příjemce" a dárek
-- nevznikl. Teď to pozná databáze sama, ať objednávka přijde odkudkoli:
--   * raw_payload.gift-no-address = 'yes'  NEBO  adresa = zástupná;
--   * BEFORE: smaže zástupnou adresu/datum/čas, nastaví gift_status;
--     opakovaný webhook už nepřepíše adresu, kterou zadal příjemce;
--   * AFTER: založí gift_links (token) a pošle manažerům úkol do Telegramu.
-- Na konci se zpracují i objednávky, které už přišly se zástupnou adresou.

CREATE OR REPLACE FUNCTION gift_orders_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ph constant text := 'Adresu zadá příjemce';
BEGIN
  IF NOT (coalesce(NEW.raw_payload->>'gift-no-address', '') = 'yes' OR NEW.address = v_ph) THEN
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
END $$;

CREATE OR REPLACE FUNCTION gift_orders_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p jsonb := coalesce(NEW.raw_payload, '{}'::jsonb);
  v_channel text := CASE WHEN p->>'gift-channel' IN ('telegram', 'whatsapp', 'instagram', 'phone') THEN p->>'gift-channel' ELSE 'phone' END;
  v_handle text := nullif(btrim(coalesce(p->>'gift-handle', NEW.recipient_phone, p->>'recipients-phone-number', '')), '');
  v_name text := coalesce(nullif(btrim(p->>'gift-recipient-name'), ''), nullif(btrim(NEW.recipient_name), ''));
  v_hash text := gift_contact_hash(v_handle);
  v_token text := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40);
  v_blocked boolean;
  v_url text;
BEGIN
  IF NEW.gift_status IS DISTINCT FROM 'awaiting_input' OR coalesce(NEW.order_id, '') IN ('', 'no_id') THEN RETURN NEW; END IF;
  -- cokoli tady selže, nesmí shodit příjem objednávky
  BEGIN
  IF EXISTS (SELECT 1 FROM gift_links WHERE order_id = NEW.order_id) THEN RETURN NEW; END IF;

  INSERT INTO gift_links (order_id, token, sender_token, recipient_channel, recipient_handle, recipient_name, contact_hash,
                          sender_name, sender_name_visible, sender_email, min_delivery_date)
  VALUES (NEW.order_id, v_token, left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40),
          v_channel, v_handle, v_name, v_hash,
          nullif(btrim(coalesce(p->>'senders-name-postcard', NEW.customer_name, p->>'name', '')), ''),
          coalesce(p->>'gift-sender-visible', 'yes') <> 'no',
          nullif(lower(btrim(coalesce(NEW.customer_email, ''))), ''),
          gift_min_date(NEW.order_id))
  ON CONFLICT (order_id) DO NOTHING;

  v_blocked := v_hash IS NOT NULL AND EXISTS (SELECT 1 FROM gift_do_not_contact WHERE contact_hash = v_hash);
  v_url := CASE
    WHEN v_handle IS NULL THEN NULL
    WHEN v_channel = 'whatsapp' THEN 'https://wa.me/' || CASE WHEN length(regexp_replace(v_handle, '\D', '', 'g')) = 9 THEN '420' ELSE '' END || regexp_replace(v_handle, '\D', '', 'g')
    WHEN v_channel = 'telegram' AND v_handle ~ '[A-Za-z]' THEN 'https://t.me/' || regexp_replace(v_handle, '^@', '')
    WHEN v_channel = 'instagram' THEN 'https://instagram.com/' || regexp_replace(v_handle, '^@', '')
    ELSE v_handle END;

  PERFORM notify_telegram_role('manager',
    CASE WHEN v_blocked THEN '⛔️ <b>Этот контакт раньше отказался от подарков без адреса!</b> Не пишите ему — свяжитесь с отправителем.' || E'\n\n' ELSE '' END ||
    '🎁 <b>Подарок без адреса</b> — заказ <code>' || NEW.order_id || '</code>' || E'\n' ||
    CASE WHEN v_handle IS NULL
         THEN 'Контакт получателя не пришёл — свяжитесь с отправителем (' || coalesce(NEW.customer_phone, NEW.customer_email, '?') || ').'
         ELSE 'Напишите получателю' || coalesce(' (' || v_name || ')', '') || ' в <b>' || v_channel || '</b>: ' || v_url END || E'\n' ||
    'Ссылка для него: https://vezminarin.cz/prijem-daru?t=' || v_token || E'\n' ||
    'Готовый текст — в приложении (Подарки без адреса). После отправки нажмите «Отправил».');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'gift_orders_after % failed: %', NEW.order_id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_gift_orders_before ON tilda_orders;   -- "zz": po ostatních BEFORE triggerech (souřadnice z raw_payload)
CREATE TRIGGER zz_gift_orders_before BEFORE INSERT OR UPDATE ON tilda_orders
  FOR EACH ROW EXECUTE FUNCTION gift_orders_before();
DROP TRIGGER IF EXISTS zz_gift_orders_after ON tilda_orders;
CREATE TRIGGER zz_gift_orders_after AFTER INSERT OR UPDATE ON tilda_orders
  FOR EACH ROW EXECUTE FUNCTION gift_orders_after();

-- objednávky, které už přišly jako dárek se zástupnou adresou
UPDATE tilda_orders SET address = address
WHERE address = 'Adresu zadá příjemce' AND status = 'new'
  AND NOT EXISTS (SELECT 1 FROM gift_links g WHERE g.order_id = tilda_orders.order_id);
