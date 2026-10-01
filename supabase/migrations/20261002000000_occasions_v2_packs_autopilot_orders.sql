-- Důležité dny v2 (spouští se PO 20261001000000_occasions_reminders_namedays).
--
-- Co se mění podle zadání:
--  * svátky: obvyklé (Valentýn, MDŽ, Den matek SNS, 1. září, Vánoce, pravoslavné
--    Vánoce) má každý, bez přepínače; český balíček je rozšířený o státní a významné
--    dny (Nový rok, Velikonoce, 1. máj, sv. Václav, 28. října, 17. listopadu…);
--  * jmeniny už NEhádáme ze jména člověka. Klient si je zapne a pak: každý den
--    vidí, kdo má svátek, a sám si vybere jména, na která chce upozorňovat;
--  * méně e-mailů: jen jeden e-mail k vlastním lidem/datům/vybraným jmeninám
--    (obecné svátky jen ve widgetu a na stránce), žádná "poslední šance";
--    předstih 1, 3 nebo 7 dní (výchozí 3);
--  * autopilot (jen když si ho klient u člověka zapne): místo zprávy do Telegramu
--    rovnou vznikne objednávka se všemi údaji. Když na depozitu stačí peníze,
--    rovnou se stáhnou; jinak dostane klient zprávu do chatu, jak doplatit;
--  * typy dárků (kytice, dort, jahody, plyšák…) jsou v tabulce — teď aktivní jen
--    kytice, ostatní se zapnou, až budou v katalogu NARIN Dárky.
-- Bezpečné spustit opakovaně.

-- ---------- svátky ----------
-- Velikonoční neděle (anonymní gregoriánský algoritmus)
CREATE OR REPLACE FUNCTION occ_easter(y int)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
BEGIN
  a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  RETURN make_date(y, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
END $$;

CREATE OR REPLACE FUNCTION occ_next_easter(p_offset int, p_from date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN occ_easter(extract(year FROM p_from)::int) + p_offset >= p_from
              THEN occ_easter(extract(year FROM p_from)::int) + p_offset
              ELSE occ_easter(extract(year FROM p_from)::int + 1) + p_offset END
$$;

CREATE OR REPLACE FUNCTION occ_holiday_next(p_key text, p_from date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    -- obvyklé
    WHEN 'valentyn' THEN occ_next_annual(2, 14, p_from)
    WHEN 'mdz' THEN occ_next_annual(3, 8, p_from)
    WHEN 'den_matek_sns' THEN occ_next_last_sunday(11, p_from)
    WHEN 'skolni_rok' THEN occ_next_annual(9, 1, p_from)
    WHEN 'vanoce' THEN occ_next_annual(12, 24, p_from)
    WHEN 'vanoce_prav' THEN occ_next_annual(1, 7, p_from)
    -- české
    WHEN 'novy_rok' THEN occ_next_annual(1, 1, p_from)
    WHEN 'den_ucitelu' THEN occ_next_annual(3, 28, p_from)
    WHEN 'velikonoce' THEN occ_next_easter(0, p_from)
    WHEN 'velikonocni_pondeli' THEN occ_next_easter(1, p_from)
    WHEN 'prvni_maj' THEN occ_next_annual(5, 1, p_from)
    WHEN 'den_vitezstvi' THEN occ_next_annual(5, 8, p_from)
    WHEN 'den_matek' THEN occ_next_nth_sunday(5, 2, p_from)
    WHEN 'den_otcu' THEN occ_next_nth_sunday(6, 3, p_from)
    WHEN 'cyril_metodej' THEN occ_next_annual(7, 5, p_from)
    WHEN 'jan_hus' THEN occ_next_annual(7, 6, p_from)
    WHEN 'svaty_vaclav' THEN occ_next_annual(9, 28, p_from)
    WHEN 'vznik_csr' THEN occ_next_annual(10, 28, p_from)
    WHEN 'dusicky' THEN occ_next_annual(11, 2, p_from)
    WHEN 'den_svobody' THEN occ_next_annual(11, 17, p_from)
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION occ_holiday_name(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'valentyn' THEN 'Valentýn' WHEN 'mdz' THEN 'MDŽ' WHEN 'den_matek_sns' THEN 'Den matek (SNS)'
    WHEN 'skolni_rok' THEN '1. září' WHEN 'vanoce' THEN 'Vánoce' WHEN 'vanoce_prav' THEN 'Pravoslavné Vánoce'
    WHEN 'novy_rok' THEN 'Nový rok' WHEN 'den_ucitelu' THEN 'Den učitelů'
    WHEN 'velikonoce' THEN 'Velikonoce' WHEN 'velikonocni_pondeli' THEN 'Velikonoční pondělí'
    WHEN 'prvni_maj' THEN '1. máj' WHEN 'den_vitezstvi' THEN 'Den vítězství'
    WHEN 'den_matek' THEN 'Den matek' WHEN 'den_otcu' THEN 'Den otců'
    WHEN 'cyril_metodej' THEN 'Cyril a Metoděj' WHEN 'jan_hus' THEN 'Mistr Jan Hus'
    WHEN 'svaty_vaclav' THEN 'Svatý Václav' WHEN 'vznik_csr' THEN 'Vznik Československa'
    WHEN 'dusicky' THEN 'Dušičky' WHEN 'den_svobody' THEN 'Den boje za svobodu'
    ELSE p_key END
$$;

CREATE OR REPLACE FUNCTION occ_pack_keys(p_basic boolean, p_cz boolean)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN p_basic THEN ARRAY['valentyn','mdz','den_matek_sns','skolni_rok','vanoce','vanoce_prav'] ELSE ARRAY[]::text[] END)
      || (CASE WHEN p_cz THEN ARRAY['novy_rok','den_ucitelu','velikonoce','velikonocni_pondeli','prvni_maj','den_vitezstvi',
              'den_matek','den_otcu','cyril_metodej','jan_hus','svaty_vaclav','vznik_csr','dusicky','den_svobody'] ELSE ARRAY[]::text[] END)
$$;

-- ---------- jmeniny podle výběru klienta ----------
ALTER TABLE occasion_settings ADD COLUMN IF NOT EXISTS nameday_names text[] NOT NULL DEFAULT '{}';
-- obvyklé svátky má každý (bez přepínače); předstih jen 1 / 3 / 7 dní
UPDATE occasion_settings SET pack_basic = true WHERE NOT pack_basic;
UPDATE occasion_settings SET lead_days = CASE WHEN lead_days <= 1 THEN 1 WHEN lead_days <= 4 THEN 3 ELSE 7 END
WHERE lead_days NOT IN (1, 3, 7);

-- jmeniny dnes/zítra (pro widget), jen podle kalendáře
CREATE OR REPLACE FUNCTION cz_namedays_on(p_date date)
RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(name ORDER BY name), '{}') FROM cz_namedays
  WHERE month = extract(month FROM p_date) AND day = extract(day FROM p_date)
$$;

-- ---------- typy dárků (připraveno na katalog NARIN Dárky) ----------
CREATE TABLE IF NOT EXISTS occasion_gift_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  emoji text NOT NULL DEFAULT '🎁',
  active boolean NOT NULL DEFAULT false,   -- zapnout, až bude v katalogu
  catalog_url text,                        -- kam vede "Vybrat" (sekce katalogu)
  sort_order int NOT NULL DEFAULT 0
);
INSERT INTO occasion_gift_types (key, label, emoji, active, catalog_url, sort_order) VALUES
  ('kytice', 'Kytice', '💐', true, 'https://vezminarin.cz/page118819546.html', 1),
  ('dort', 'Dort', '🎂', false, NULL, 2),
  ('jahody', 'Jahody v čokoládě', '🍓', false, NULL, 3),
  ('plysak', 'Plyšák', '🧸', false, NULL, 4),
  ('na_vas', 'Nechám na vás', '✨', true, NULL, 99)
ON CONFLICT (key) DO NOTHING;
ALTER TABLE occasion_gift_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_occasion_gift_types" ON occasion_gift_types;
CREATE POLICY "public_read_occasion_gift_types" ON occasion_gift_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "manager_all_occasion_gift_types" ON occasion_gift_types;
CREATE POLICY "manager_all_occasion_gift_types" ON occasion_gift_types FOR ALL USING (is_manager()) WITH CHECK (is_manager());

-- ---------- co se kdy slaví ----------
DROP FUNCTION IF EXISTS occasion_upcoming(text, int);
CREATE OR REPLACE FUNCTION occasion_upcoming(p_email text DEFAULT NULL, p_days int DEFAULT 400)
RETURNS TABLE(email text, occasion_key text, occasion_date date, kind text, title text,
              person text, recipient_id uuid, years int)
LANGUAGE sql STABLE AS $$
  WITH t AS (SELECT occ_prague_today() AS d0),
  st AS (
    SELECT s.email, s.pack_cz, s.namedays, s.nameday_names FROM occasion_settings s
    WHERE p_email IS NULL OR s.email = lower(p_email)
    UNION ALL
    SELECT e.email, false, false, '{}'::text[]
    FROM (
      SELECT lower(p_email) AS email WHERE p_email IS NOT NULL
      UNION SELECT lower(owner_email) FROM recipients WHERE p_email IS NULL
      UNION SELECT lower(personal_dates.email) FROM personal_dates WHERE p_email IS NULL
    ) e
    WHERE e.email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM occasion_settings s2 WHERE s2.email = e.email)
  ),
  pd AS (
    SELECT lower(p.email) AS email, 'pd:' || p.id AS occasion_key,
      CASE p.recurrence
        WHEN 'yearly' THEN occ_next_annual(extract(month FROM p.event_date)::int, extract(day FROM p.event_date)::int, t.d0)
        WHEN 'monthly' THEN CASE
          WHEN occ_make_date(extract(year FROM t.d0)::int, extract(month FROM t.d0)::int, extract(day FROM p.event_date)::int) >= t.d0
          THEN occ_make_date(extract(year FROM t.d0)::int, extract(month FROM t.d0)::int, extract(day FROM p.event_date)::int)
          ELSE occ_make_date(extract(year FROM (t.d0 + interval '1 month'))::int, extract(month FROM (t.d0 + interval '1 month'))::int, extract(day FROM p.event_date)::int) END
        ELSE p.event_date END AS occasion_date,
      'date' AS kind, p.label AS title, r.name AS person, p.recipient_id,
      p.event_date AS origin, p.recurrence
    FROM personal_dates p CROSS JOIN t
    LEFT JOIN recipients r ON r.id = p.recipient_id
    WHERE p_email IS NULL OR lower(p.email) = lower(p_email)
  ),
  hol AS (
    SELECT lower(r.owner_email) AS email, 'h:' || r.id || ':' || h AS occasion_key,
      occ_holiday_next(h, t.d0) AS occasion_date, 'holiday' AS kind, occ_holiday_name(h) AS title,
      r.name AS person, r.id AS recipient_id, NULL::int AS years
    FROM recipients r CROSS JOIN t CROSS JOIN LATERAL unnest(r.holidays) AS h
    WHERE (p_email IS NULL OR lower(r.owner_email) = lower(p_email)) AND occ_holiday_next(h, t.d0) IS NOT NULL
  ),
  bd AS (
    SELECT lower(r.owner_email), 'bd:' || r.id, occ_next_annual(r.birthday_month, r.birthday_day, t.d0),
      'birthday', 'Narozeniny', r.name, r.id,
      CASE WHEN r.birthday_year IS NOT NULL
        THEN extract(year FROM occ_next_annual(r.birthday_month, r.birthday_day, t.d0))::int - r.birthday_year END
    FROM recipients r CROSS JOIN t
    WHERE (p_email IS NULL OR lower(r.owner_email) = lower(p_email))
      AND r.birthday_month IS NOT NULL AND r.birthday_day IS NOT NULL
  ),
  -- vybraná jména (jen když má klient jmeniny zapnuté)
  nd AS (
    SELECT st.email, 'nd:' || cz_name_key(n.name), occ_next_annual(n.month, n.day, t.d0),
      'nameday', 'Jmeniny: ' || n.name, NULL::text, NULL::uuid, NULL::int
    FROM st CROSS JOIN t CROSS JOIN LATERAL unnest(st.nameday_names) AS nm
    JOIN cz_namedays n ON cz_name_key(n.name) = cz_name_key(nm)
    WHERE st.namedays
  ),
  gen AS (
    SELECT st.email, 'g:' || k, occ_holiday_next(k, t.d0), 'general', occ_holiday_name(k),
      NULL::text, NULL::uuid, NULL::int
    FROM st CROSS JOIN t CROSS JOIN LATERAL unnest(occ_pack_keys(true, st.pack_cz)) AS k
    WHERE NOT EXISTS (SELECT 1 FROM recipients r WHERE lower(r.owner_email) = st.email AND k = ANY(r.holidays))
  ),
  allrows AS (
    SELECT pd.email, pd.occasion_key, pd.occasion_date, pd.kind, pd.title, pd.person, pd.recipient_id,
      CASE WHEN pd.recurrence = 'yearly' AND extract(year FROM pd.origin) < extract(year FROM pd.occasion_date)
        THEN (extract(year FROM pd.occasion_date) - extract(year FROM pd.origin))::int END AS years
    FROM pd
    UNION ALL SELECT * FROM hol
    UNION ALL SELECT * FROM bd
    UNION ALL SELECT * FROM nd
    UNION ALL SELECT * FROM gen
  )
  SELECT a.* FROM allrows a, t
  WHERE a.occasion_date >= t.d0 AND a.occasion_date <= t.d0 + p_days
  ORDER BY a.occasion_date, (a.kind = 'general'), a.person NULLS LAST, a.title
$$;
REVOKE ALL ON FUNCTION occasion_upcoming(text, int) FROM PUBLIC, anon, authenticated;

-- ---------- zpráva klientovi do chatu (od NARIN) ----------
-- Zpráva manažera v support_messages sama spustí e-mail "máte odpověď" (notify_customer_reply).
CREATE OR REPLACE FUNCTION occ_chat_to_customer(p_email text, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conv uuid;
BEGIN
  SELECT id INTO v_conv FROM support_conversations WHERE lower(email) = lower(p_email)
  ORDER BY (status = 'open') DESC, last_message_at DESC LIMIT 1;
  IF v_conv IS NULL THEN
    INSERT INTO support_conversations (email, unread_by_manager) VALUES (lower(p_email), false) RETURNING id INTO v_conv;
  END IF;
  INSERT INTO support_messages (conversation_id, sender_type, body) VALUES (v_conv, 'manager', left(p_body, 2000));
  UPDATE support_conversations SET last_message_at = now(), last_message_preview = left(p_body, 120), status = 'open'
  WHERE id = v_conv;
END $$;
REVOKE ALL ON FUNCTION occ_chat_to_customer(text, text) FROM PUBLIC, anon, authenticated;

-- ---------- denní běh ----------
CREATE OR REPLACE FUNCTION send_occasion_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := occ_prague_today();
  v_sent int := 0;
  rec record;
  v_balance numeric;
  v_paid boolean;
  v_order_id text;
  v_missing text;
  v_gifts text;
  v_body text;
BEGIN
  -- 1) jeden e-mail předem (1 / 3 / 7 dní), jen k vlastním lidem, datům a vybraným jmeninám.
  --    Obecné svátky e-mailem neposíláme (jsou ve widgetu a na stránce).
  FOR rec IN
    WITH due AS (
      SELECT u.*, coalesce(s.lead_days, 3) AS lead
      FROM occasion_upcoming(NULL, 8) u
      LEFT JOIN occasion_settings s ON s.email = u.email
      WHERE u.kind <> 'general'
        AND coalesce(s.email_enabled, true)
        AND u.occasion_date = v_today + coalesce(s.lead_days, 3)
        AND NOT EXISTS (
          SELECT 1 FROM tilda_orders o
          WHERE lower(o.customer_email) = u.email AND o.status IS DISTINCT FROM 'cancelled'
            AND o.delivery_date BETWEEN u.occasion_date - 1 AND u.occasion_date)
    ),
    fresh AS (
      INSERT INTO occasion_reminder_log (email, occasion_key, occasion_date, kind)
      SELECT email, occasion_key, occasion_date, 'first' FROM due
      ON CONFLICT DO NOTHING
      RETURNING email, occasion_key, occasion_date
    )
    SELECT d.email, max(d.lead) AS lead,
      jsonb_agg(jsonb_build_object('key', d.occasion_key, 'date', d.occasion_date, 'kind', d.kind, 'title', d.title,
        'person', d.person, 'recipient_id', d.recipient_id, 'years', d.years,
        'budget', rr.budget, 'gift_prefs', coalesce(to_jsonb(rr.gift_prefs), '[]'::jsonb), 'autopilot', coalesce(rr.autopilot, false))
        ORDER BY d.occasion_date, d.person) AS items
    FROM due d JOIN fresh f USING (email, occasion_key, occasion_date)
    LEFT JOIN recipients rr ON rr.id = d.recipient_id
    GROUP BY d.email
  LOOP
    PERFORM notify_brevo(jsonb_build_object('event', 'occasion_reminder', 'order_id', 'occasions', 'email', rec.email,
      'days', rec.lead, 'items', rec.items));
    v_sent := v_sent + 1;
  END LOOP;

  -- 2) autopilot (jen u lidí, kde si ho klient zapnul): 2 dny předem, když klient nic
  --    neobjednal, vznikne objednávka. Zaplaceno z depozitu, pokud stačí; jinak zpráva do chatu.
  FOR rec IN
    WITH due AS (
      SELECT u.*, r.budget, r.gift_prefs, r.note, r.address, r.address_lat, r.address_lng, r.phone, r.name
      FROM occasion_upcoming(NULL, 3) u
      JOIN recipients r ON r.id = u.recipient_id AND r.autopilot
      WHERE u.occasion_date = v_today + 2
        AND NOT EXISTS (
          SELECT 1 FROM tilda_orders o
          WHERE lower(o.customer_email) = u.email AND o.status IS DISTINCT FROM 'cancelled'
            AND o.delivery_date BETWEEN u.occasion_date - 1 AND u.occasion_date)
    ),
    fresh AS (
      INSERT INTO occasion_reminder_log (email, occasion_key, occasion_date, kind)
      SELECT email, occasion_key, occasion_date, 'autopilot' FROM due
      ON CONFLICT DO NOTHING
      RETURNING email, occasion_key, occasion_date
    )
    SELECT d.* FROM due d JOIN fresh f USING (email, occasion_key, occasion_date)
  LOOP
    v_order_id := 'AUTO-' || upper(substr(md5(rec.occasion_key || rec.occasion_date::text), 1, 8));
    v_gifts := coalesce(nullif((SELECT string_agg(g.label, ', ' ORDER BY g.sort_order)
                 FROM occasion_gift_types g WHERE g.key = ANY(rec.gift_prefs) AND g.key <> 'na_vas'), ''), 'na uvážení floristy');
    v_missing := concat_ws(', ',
      CASE WHEN coalesce(rec.budget, 0) <= 0 THEN 'rozpočet' END,
      CASE WHEN coalesce(rec.address, '') = '' THEN 'adresa' END,
      CASE WHEN coalesce(rec.phone, '') = '' THEN 'telefon příjemce' END);

    -- depozit: stáhnout jen když stačí na celý rozpočet (zamčeno proti souběhu)
    v_paid := false;
    v_balance := NULL;
    IF coalesce(rec.budget, 0) > 0 THEN
      SELECT balance INTO v_balance FROM customer_deposits WHERE lower(email) = rec.email FOR UPDATE;
      IF coalesce(v_balance, 0) >= rec.budget THEN
        UPDATE customer_deposits SET balance = balance - rec.budget WHERE lower(email) = rec.email;
        INSERT INTO deposit_transactions (user_email, amount, type, order_id, description)
        VALUES (rec.email, -rec.budget, 'autopilot', v_order_id, 'Autopilot: ' || rec.title || ' – ' || rec.name)
        ON CONFLICT DO NOTHING;
        v_paid := true;
      END IF;
    END IF;

    INSERT INTO tilda_orders (order_id, customer_email, recipient_name, recipient_phone, address,
      recipient_lat, recipient_lng, delivery_date, delivery_type, products_text, goods_total, order_total,
      payment_method, payment_status, used_deposit, raw_payload, manager_comment, status)
    VALUES (v_order_id, rec.email, rec.name, nullif(rec.phone, ''), nullif(rec.address, ''),
      rec.address_lat, rec.address_lng, rec.occasion_date, 'Doručení kurýrem (autopilot)',
      'Autopilot: ' || rec.title || ' – ' || rec.name || E'\n' || v_gifts,
      coalesce(rec.budget, 0), coalesce(rec.budget, 0),
      'deposit', CASE WHEN v_paid THEN '🟢 Оплачено' ELSE '🟠 Ожидает оплаты' END,
      CASE WHEN v_paid THEN rec.budget ELSE 0 END,
      jsonb_build_object('payment', jsonb_build_object(
        'products', jsonb_build_array(jsonb_build_object('name', 'Dárek – ' || v_gifts, 'price', coalesce(rec.budget, 0)::text, 'quantity', 1)),
        'amount', coalesce(rec.budget, 0)::text)),
      '🤖 АВТОПИЛОТ (клиент сам ничего не выбрал)' ||
        E'\nПовод: ' || rec.title || CASE WHEN rec.years IS NOT NULL THEN ' (' || rec.years || ')' ELSE '' END ||
        E'\nЧто дарить: ' || v_gifts ||
        E'\nБюджет: ' || coalesce(rec.budget::text || ' Kč', 'не указан') ||
        coalesce(E'\nПожелания: ' || nullif(rec.note, ''), '') ||
        E'\nОплата: ' || CASE WHEN v_paid THEN 'списано с депозита' ELSE 'ждём (на депозите не хватает) — клиенту ушло сообщение в чат' END ||
        CASE WHEN v_missing <> '' THEN E'\nНЕ ХВАТАЕТ: ' || v_missing || ' — уточнить у клиента в чате' ELSE '' END,
      'new')
    ON CONFLICT DO NOTHING;

    v_body := '🤖 Autopilot: na ' || to_char(rec.occasion_date, 'DD. MM.') || ' (' || rec.title || ' – ' || rec.name || ') ' ||
      'jste zatím nic nevybrali, tak dárek připravíme my: ' || lower(v_gifts) ||
      CASE WHEN coalesce(rec.budget, 0) > 0 THEN ' do ' || rec.budget || ' Kč' ELSE '' END || '. ' ||
      CASE WHEN v_paid THEN 'Částku jsme stáhli z vašeho depozitu. '
           WHEN coalesce(rec.budget, 0) > 0 THEN 'Na depozitu chybí ' || (rec.budget - coalesce(v_balance, 0))::int || ' Kč – doplňte je prosím převodem (údaje najdete u depozitu v účtu) nebo nám tu napište. '
           ELSE '' END ||
      CASE WHEN v_missing <> '' THEN 'Ještě nám prosím napište: ' || v_missing || '. ' ELSE '' END ||
      'Chcete něco změnit nebo to zrušit? Stačí odpovědět sem.';
    PERFORM occ_chat_to_customer(rec.email, v_body);
    v_sent := v_sent + 1;
  END LOOP;

  DELETE FROM occasion_reminder_log WHERE occasion_date < v_today - 400;
  RETURN v_sent;
END;
$$;
REVOKE ALL ON FUNCTION send_occasion_reminders() FROM PUBLIC, anon, authenticated;
