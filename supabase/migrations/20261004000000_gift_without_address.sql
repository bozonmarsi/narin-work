-- Dárek bez adresy příjemce.
--
-- Odesílatel zaplatí kytici a zná jen kontakt příjemce. Manažer (ručně, ne bot)
-- pošle příjemci odkaz vezminarin.cz/prijem-daru?t=<token>, příjemce sám zadá
-- adresu a čas. Volitelně anonymně. Když do 48 h nic, objednávka se zruší a
-- manažer vrátí peníze (Stripe refund zatím ručně — viz gift_close).
--
-- Kdo co dělá:
--   tilda-webhook            vytvoří gift_links (+ token) a pošle manažerům úkol do Telegramu;
--   edge funkce gift-link    veřejné API pro Tilda stránky: check / get / confirm / optout
--                            (žádný přímý přístup prohlížeče do DB);
--   aplikace (Дашборд)       seznam "Подарки без адреса" + tlačítko "Отправил";
--   gift_tick() (pg_cron)    eskalace manažerovi, připomínky 3 h / 12 h, e-mail
--                            odesílateli po 24 h, zrušení po 48 h, mazání kontaktu po 30 dnech.
--
-- Objednávka čeká ve stavu 'new' (sklad, florista ani kurýr ji nevidí) a má
-- tilda_orders.gift_status; potvrdit ji jde až po zadání adresy.

ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS gift_status text;

CREATE TABLE IF NOT EXISTS gift_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,              -- odkaz pro příjemce
  sender_token text NOT NULL UNIQUE,       -- odkaz pro odesílatele (po 24 h zadá adresu sám)
  recipient_channel text NOT NULL CHECK (recipient_channel IN ('telegram', 'whatsapp', 'instagram', 'phone')),
  recipient_handle text,                   -- @uživatel / telefon — maže se 30 dní po uzavření
  recipient_name text,
  contact_hash text,                       -- pro kontrolu gift_do_not_contact
  sender_name text,
  sender_name_visible boolean NOT NULL DEFAULT true,
  sender_email text,
  status text NOT NULL DEFAULT 'awaiting_input'
    CHECK (status IN ('awaiting_input', 'confirmed', 'sender_manual', 'expired', 'opted_out')),
  min_delivery_date date,
  recipient_address text,
  recipient_slot text,
  delivery_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  manager_sent_at timestamptz,
  manager_escalated_at timestamptz,
  reminder_3h_sent boolean NOT NULL DEFAULT false,
  reminder_12h_sent boolean NOT NULL DEFAULT false,
  sender_notified_at timestamptz,
  closed_at timestamptz,
  purged_at timestamptz
);
CREATE INDEX IF NOT EXISTS gift_links_open_idx ON gift_links (status) WHERE status = 'awaiting_input';

ALTER TABLE gift_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manager_all_gift_links" ON gift_links;
CREATE POLICY "manager_all_gift_links" ON gift_links FOR ALL USING (is_manager()) WITH CHECK (is_manager());

-- Opt-out přežije smazání kontaktu: ukládáme jen hash.
CREATE TABLE IF NOT EXISTS gift_do_not_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gift_do_not_contact ENABLE ROW LEVEL SECURITY;  -- jen service role

-- Telefon → posledních 9 číslic (+420 / 00420 / bez předvolby je totéž),
-- jinak @handle malými písmeny bez @.
CREATE OR REPLACE FUNCTION gift_contact_hash(p_handle text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_handle IS NULL OR btrim(p_handle) = '' THEN NULL ELSE
    encode(sha256(convert_to('narin-gift:' ||
      CASE WHEN length(regexp_replace(p_handle, '\D', '', 'g')) >= 9
             AND p_handle !~ '[A-Za-z_]'
           THEN right(regexp_replace(p_handle, '\D', '', 'g'), 9)
           ELSE lower(regexp_replace(btrim(p_handle), '^@+', ''))
      END, 'UTF8')), 'hex') END;
$$;

-- Den je zavřený (týdenní volno nebo jednorázově zavřeno)?
CREATE OR REPLACE FUNCTION gift_day_closed(p_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM shop_weekly_closed_days WHERE weekday = extract(dow FROM p_date)::int)
      OR EXISTS (SELECT 1 FROM shop_closed_dates WHERE closed_date = p_date);
$$;

-- Nejdřívější den doručení: nikdy dnes, nejdřív zítra; když je v objednávce
-- zboží na speciální objednávku, 2 pracovní dny (stejně jako na pokladně).
CREATE OR REPLACE FUNCTION gift_min_date(p_order_id text)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Prague')::date;
  v_d date := v_today;
  v_need int := 1;
  v_special boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM tilda_orders o,
         jsonb_array_elements(coalesce(o.raw_payload->'payment'->'products', '[]'::jsonb)) pr
    JOIN product_stickers ps ON ps.special_order AND NOT ps.archived
      AND decode_html_entities(ps.product_name) = decode_html_entities(pr->>'name')
    WHERE o.order_id = p_order_id
  ) INTO v_special;
  IF v_special THEN v_need := 2; END IF;
  WHILE v_need > 0 LOOP
    v_d := v_d + 1;
    IF NOT gift_day_closed(v_d) THEN v_need := v_need - 1; END IF;
  END LOOP;
  RETURN v_d;
END $$;

-- Volné termíny pro stránku příjemce: N otevřených dní od min. data a sloty
-- (shop_closed_slots zavírá jednotlivé sloty).
CREATE OR REPLACE FUNCTION gift_available_dates(p_order_id text, p_days int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_d date := gift_min_date(p_order_id);
  v_out jsonb := '[]'::jsonb;
  v_n int := 0;
  v_guard int := 0;
BEGIN
  WHILE v_n < p_days AND v_guard < 60 LOOP
    IF NOT gift_day_closed(v_d) THEN
      v_out := v_out || jsonb_build_object('date', v_d, 'slots', (
        SELECT jsonb_agg(jsonb_build_object('label', s.label,
                 'open', NOT EXISTS (SELECT 1 FROM shop_closed_slots c WHERE c.closed_date = v_d AND c.slot_label = s.label))
               ORDER BY s.ord)
        FROM (VALUES ('9-12', 1), ('12-15', 2), ('15-18', 3), ('18-20', 4)) s(label, ord)));
      v_n := v_n + 1;
    END IF;
    v_d := v_d + 1;
    v_guard := v_guard + 1;
  END LOOP;
  RETURN v_out;
END $$;

-- Uzavření bez doručení (48 h vypršelo / příjemce odmítl):
-- zrušit objednávku, vrátit uplatněné body, smazat telefon příjemce z objednávky,
-- manažerům úkol na vrácení peněz, odesílateli e-mail.
CREATE OR REPLACE FUNCTION gift_close(p_gift_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g gift_links%ROWTYPE;
  o record;
  v_reason text := CASE WHEN p_status = 'opted_out' THEN 'Zrušeno — příjemce dárek odmítl' ELSE 'Zrušeno — dárek nevyzvednut' END;
BEGIN
  UPDATE gift_links SET status = p_status, closed_at = now()
  WHERE id = p_gift_id AND status = 'awaiting_input'
  RETURNING * INTO g;
  IF g.id IS NULL THEN RETURN; END IF;

  UPDATE tilda_orders SET status = 'cancelled', cancelled_reason = v_reason, gift_status = p_status, recipient_phone = NULL
  WHERE order_id = g.order_id
  RETURNING order_id, customer_email, order_total, used_points, payment_method, payment_status INTO o;

  -- uplatněné body zpět (jednou)
  IF coalesce(o.used_points, 0) > 0 AND coalesce(o.customer_email, '') <> ''
     AND NOT EXISTS (SELECT 1 FROM points_transactions WHERE order_id = g.order_id AND type = 'gift_refund') THEN
    UPDATE "Tilda points" SET balance = balance + o.used_points WHERE lower(email) = lower(o.customer_email);
    INSERT INTO points_transactions (user_email, amount, type, order_id, description)
    VALUES (lower(o.customer_email), o.used_points, 'gift_refund', g.order_id, 'Vrácení bodů — ' || v_reason);
  END IF;

  PERFORM notify_telegram_role('manager',
    '💸 <b>Подарок без адреса отменён</b>' || E'\n' ||
    'Заказ <code>' || g.order_id || '</code>: ' || CASE WHEN p_status = 'opted_out' THEN 'получатель отказался' ELSE 'за 48 ч адрес не указали' END || E'\n' ||
    'Верните деньги отправителю: <b>' || coalesce(o.order_total, 0)::int || ' Kč</b> (' || coalesce(o.payment_method, '?') || ', ' || coalesce(o.payment_status, '?') || ')' ||
    CASE WHEN coalesce(o.used_points, 0) > 0 THEN E'\nБаллы (' || o.used_points || ') уже вернули автоматически.' ELSE '' END);

  IF coalesce(o.customer_email, '') <> '' THEN
    PERFORM notify_brevo(jsonb_build_object('event', 'gift_cancelled', 'order_id', g.order_id, 'email', lower(o.customer_email),
      'recipient_name', g.recipient_name, 'order_total', o.order_total, 'reason', p_status));
  END IF;
END $$;
REVOKE ALL ON FUNCTION gift_close(uuid, text) FROM PUBLIC, anon, authenticated;

-- Každých 15 minut.
CREATE OR REPLACE FUNCTION gift_tick()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record;
  v_n int := 0;
  v_age interval;
BEGIN
  FOR g IN SELECT * FROM gift_links WHERE status = 'awaiting_input' ORDER BY created_at LOOP
    v_age := now() - g.created_at;

    IF now() >= g.expires_at THEN
      PERFORM gift_close(g.id, 'expired'); v_n := v_n + 1; CONTINUE;
    END IF;

    -- manažer ještě neposlal odkaz: připomínat každých 30 min
    IF g.manager_sent_at IS NULL AND v_age >= interval '30 minutes'
       AND (g.manager_escalated_at IS NULL OR g.manager_escalated_at <= now() - interval '30 minutes') THEN
      PERFORM notify_telegram_role('manager',
        '⏰ <b>Подарок без адреса ещё НЕ отправлен получателю!</b>' || E'\n' ||
        'Заказ <code>' || g.order_id || '</code>, ждёт ' || floor(extract(epoch FROM v_age) / 60)::int || ' мин.' || E'\n' ||
        'Приложение → Подарки без адреса → напишите получателю и нажмите «Отправил».');
      UPDATE gift_links SET manager_escalated_at = now() WHERE id = g.id;
      v_n := v_n + 1;
    END IF;

    -- příjemce mlčí: připomínka manažerovi po 3 h a 12 h
    IF g.manager_sent_at IS NOT NULL AND v_age >= interval '3 hours' AND NOT g.reminder_3h_sent THEN
      PERFORM notify_telegram_role('manager', '🔔 Получатель подарка <code>' || g.order_id || '</code> молчит 3 ч. Напишите ему ещё раз (ссылка в приложении).');
      UPDATE gift_links SET reminder_3h_sent = true WHERE id = g.id; v_n := v_n + 1;
    END IF;
    IF g.manager_sent_at IS NOT NULL AND v_age >= interval '12 hours' AND NOT g.reminder_12h_sent THEN
      PERFORM notify_telegram_role('manager', '🔔 Получатель подарка <code>' || g.order_id || '</code> молчит 12 ч. Последнее напоминание; через 24 ч напишем отправителю.');
      UPDATE gift_links SET reminder_12h_sent = true WHERE id = g.id; v_n := v_n + 1;
    END IF;

    -- po 24 h: odesílatel může zadat adresu sám
    IF v_age >= interval '24 hours' AND g.sender_notified_at IS NULL THEN
      IF coalesce(g.sender_email, '') <> '' THEN
        PERFORM notify_brevo(jsonb_build_object('event', 'gift_sender_fallback', 'order_id', g.order_id, 'email', g.sender_email,
          'recipient_name', g.recipient_name, 'sender_link', 'https://vezminarin.cz/prijem-daru?s=' || g.sender_token,
          'expires_at', to_char(g.expires_at AT TIME ZONE 'Europe/Prague', 'DD. MM. HH24:MI')));
      END IF;
      UPDATE gift_links SET sender_notified_at = now() WHERE id = g.id; v_n := v_n + 1;
    END IF;
  END LOOP;

  -- GDPR: kontakt příjemce smazat 30 dní po uzavření
  -- (i ze surových dat objednávky; u nedoručených i telefon příjemce)
  WITH p AS (
    UPDATE gift_links SET recipient_handle = NULL, purged_at = now()
    WHERE purged_at IS NULL AND coalesce(closed_at, CASE WHEN status <> 'awaiting_input' THEN created_at END) < now() - interval '30 days'
    RETURNING order_id, status
  )
  UPDATE tilda_orders o
  SET raw_payload = CASE WHEN p.status IN ('expired', 'opted_out')
                         THEN o.raw_payload - 'gift-handle' - 'recipients-phone-number'
                         ELSE o.raw_payload - 'gift-handle' END
  FROM p WHERE o.order_id = p.order_id;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION gift_tick() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('gift-links-tick');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('gift-links-tick', '*/15 * * * *', $$SELECT gift_tick()$$);

-- aplikace se obnoví sama, když příjemce zadá adresu (realtime)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE gift_links;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
