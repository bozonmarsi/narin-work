-- NARIN Dárky ↔ Důležité dny.
--
-- Dárky jsou normální produkty v product_stickers (category = 'darky'),
-- jen dostanou podkategorii: přání, sladkosti, hračky, nádobí, textil,
-- doplňky. Fotku a odkaz na kartu produktu si web sám přečte z Tilda karty
-- (stejně jako cenu, viz sync_product_price) — manager nic nevyplňuje navíc.
--
-- Z toho pak žije všechno najednou:
--   * stránka /darky (taby podle podkategorie, schované, co není skladem);
--   * "Co posílat" u člověka v Důležitých dnech — typ je aktivní, jen když
--     v něm něco máme skladem;
--   * oblíbené konkrétní dárky u člověka (recipient_gift_picks);
--   * tipy v e-mailu a autopilot: oblíbený dárek, když je skladem, jinak
--     něco ze stejné podkategorie do rozpočtu, jinak kytice.
--
-- Spouštět po 20261002000000_occasions_v2. Lze spustit opakovaně.

-- ---------- produkty ----------
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS gift_subcategory text;
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS product_url text;
ALTER TABLE product_stickers DROP CONSTRAINT IF EXISTS product_stickers_gift_subcategory_check;
ALTER TABLE product_stickers ADD CONSTRAINT product_stickers_gift_subcategory_check
  CHECK (gift_subcategory IS NULL OR gift_subcategory IN ('prani', 'sladkosti', 'hracky', 'nadobi', 'textil', 'doplnky'));

-- Fotka a odkaz z Tilda karty. Jako sync_product_price: smí volat i web
-- s veřejným klíčem, ale umí jen tohle a jen s adresami z Tildy / našeho webu.
CREATE OR REPLACE FUNCTION public.sync_product_media(p_product_name text, p_photo_url text, p_product_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_product_name IS NULL OR length(p_product_name) > 200 THEN RETURN; END IF;
  IF p_photo_url IS NOT NULL AND (length(p_photo_url) > 500 OR p_photo_url !~ '^https://[a-z0-9.-]*tildacdn\.(com|one|pro|net)/') THEN
    p_photo_url := NULL;
  END IF;
  IF p_product_url IS NOT NULL AND (length(p_product_url) > 500 OR p_product_url !~ '^https://(www\.)?vezminarin\.cz/') THEN
    p_product_url := NULL;
  END IF;
  IF p_photo_url IS NULL AND p_product_url IS NULL THEN RETURN; END IF;
  UPDATE product_stickers
  SET photo_url = coalesce(p_photo_url, photo_url),
      product_url = coalesce(p_product_url, product_url)
  WHERE decode_html_entities(product_name) = p_product_name
    AND (photo_url IS DISTINCT FROM coalesce(p_photo_url, photo_url)
      OR product_url IS DISTINCT FROM coalesce(p_product_url, product_url));
END;
$$;
GRANT EXECUTE ON FUNCTION public.sync_product_media(text, text, text) TO anon, authenticated;

-- Všechny dárky (i vyprodané, s příznakem available).
-- Skladem = není archivovaný ani ručně schovaný a zásoba není 0
-- (NULL = zásobu nevedeme, bereme jako skladem — stejně jako na webu).
CREATE OR REPLACE FUNCTION public.gift_products()
RETURNS TABLE(name text, sub text, price numeric, photo_url text, product_url text, quantity int, available boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT decode_html_entities(p.product_name), p.gift_subcategory, p.price, p.photo_url, p.product_url, p.quantity,
         (NOT p.manually_hidden AND coalesce(p.quantity, 1) > 0)
  FROM product_stickers p
  WHERE p.archived = false AND p.category = 'darky';
$$;
REVOKE ALL ON FUNCTION public.gift_products() FROM PUBLIC, anon, authenticated;

-- ---------- typy dárků ----------
DELETE FROM occasion_gift_types WHERE key IN ('dort', 'jahody', 'plysak');
INSERT INTO occasion_gift_types (key, label, emoji, active, catalog_url, sort_order) VALUES
  ('kytice',    'Kytice',    '💐', true, 'https://vezminarin.cz/page118819546.html', 1),
  ('prani',     'Přání',     '💌', true, 'https://vezminarin.cz/darky#prani', 2),
  ('sladkosti', 'Sladkosti', '🍫', true, 'https://vezminarin.cz/darky#sladkosti', 3),
  ('hracky',    'Hračky',    '🧸', true, 'https://vezminarin.cz/darky#hracky', 4),
  ('nadobi',    'Nádobí',    '🍽️', true, 'https://vezminarin.cz/darky#nadobi', 5),
  ('textil',    'Textil',    '🧣', true, 'https://vezminarin.cz/darky#textil', 6),
  ('doplnky',   'Doplňky',   '🎀', true, 'https://vezminarin.cz/darky#doplnky', 7),
  ('na_vas',    'Nechám na vás', '✨', true, NULL, 99)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, emoji = EXCLUDED.emoji,
  catalog_url = EXCLUDED.catalog_url, sort_order = EXCLUDED.sort_order;

-- staré volby z v2 převedeme na nové podkategorie
UPDATE recipients SET gift_prefs = ARRAY(
  SELECT DISTINCT CASE k WHEN 'dort' THEN 'sladkosti' WHEN 'jahody' THEN 'sladkosti' WHEN 'plysak' THEN 'hracky' ELSE k END
  FROM unnest(gift_prefs) k)
WHERE gift_prefs && ARRAY['dort', 'jahody', 'plysak'];

-- "active" = vypínač pro managera; "available" = opravdu jde vybrat
-- (kytice a "nechám na vás" vždy, ostatní jen když je v podkategorii něco skladem).
CREATE OR REPLACE FUNCTION public.occ_gift_types_live()
RETURNS TABLE(key text, label text, emoji text, catalog_url text, sort_order int, available boolean, in_stock int)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT g.key, g.label, g.emoji, g.catalog_url, g.sort_order,
         g.active AND (g.key IN ('kytice', 'na_vas') OR coalesce(c.n, 0) > 0),
         coalesce(c.n, 0)::int
  FROM occasion_gift_types g
  LEFT JOIN (SELECT sub, count(*) AS n FROM gift_products() WHERE available GROUP BY sub) c ON c.sub = g.key
  ORDER BY g.sort_order;
$$;

-- Jeden dotaz pro web (/darky a Důležité dny): dárky + typy.
CREATE OR REPLACE FUNCTION public.get_gift_catalog()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'products', (SELECT coalesce(json_agg(json_build_object(
        'name', name, 'sub', sub, 'price', price, 'photo_url', photo_url,
        'product_url', product_url, 'quantity', quantity, 'available', available) ORDER BY sub, price), '[]'::json)
      FROM gift_products()),
    'types', (SELECT coalesce(json_agg(json_build_object(
        'key', key, 'label', label, 'emoji', emoji, 'catalog_url', catalog_url,
        'available', available, 'in_stock', in_stock) ORDER BY sort_order), '[]'::json)
      FROM occ_gift_types_live())
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_gift_catalog() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.occ_gift_types_live() TO anon, authenticated;

-- ---------- oblíbené dárky u člověka ----------
CREATE TABLE IF NOT EXISTS recipient_gift_picks (
  recipient_id uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  product_name text NOT NULL,            -- dekódovaný název (jako na webu)
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_id, product_name)
);
-- čte a píše jen edge funkce personal-dates (service role)
ALTER TABLE recipient_gift_picks ENABLE ROW LEVEL SECURITY;

-- Tipy pro člověka: nejdřív oblíbené, které jsou skladem, pak dárky
-- ze zvolených podkategorií do rozpočtu (dražší první — co nejlépe využít rozpočet).
CREATE OR REPLACE FUNCTION public.occ_gift_suggestions(p_recipient uuid, p_limit int DEFAULT 3)
RETURNS TABLE(name text, sub text, price numeric, photo_url text, product_url text, picked boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH r AS (SELECT budget, coalesce(gift_prefs, '{}') AS prefs FROM recipients WHERE id = p_recipient),
  pk AS (SELECT product_name FROM recipient_gift_picks WHERE recipient_id = p_recipient)
  SELECT g.name, g.sub, g.price, g.photo_url, g.product_url, (g.name IN (SELECT product_name FROM pk)) AS picked
  FROM gift_products() g, r
  WHERE g.available
    AND (g.name IN (SELECT product_name FROM pk)
      OR (g.sub = ANY(r.prefs) AND (r.budget IS NULL OR g.price IS NULL OR g.price <= r.budget)))
  ORDER BY 6 DESC, g.price DESC NULLS LAST, g.name
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.occ_gift_suggestions(uuid, int) FROM PUBLIC, anon, authenticated;

-- ---------- denní běh: tipy s konkrétními dárky + autopilot vybírá skutečný produkt ----------
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
  v_gift record;
  v_lost text;
  v_with_flowers boolean;
  v_what text;
  v_products jsonb;
  v_body text;
BEGIN
  -- 1) jeden e-mail předem (1 / 3 / 7 dní), jen k vlastním lidem, datům a vybraným jmeninám.
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
        'budget', rr.budget, 'gift_prefs', coalesce(to_jsonb(rr.gift_prefs), '[]'::jsonb), 'autopilot', coalesce(rr.autopilot, false),
        'suggestions', CASE WHEN rr.id IS NULL THEN '[]'::jsonb ELSE coalesce((
          SELECT jsonb_agg(jsonb_build_object('name', s.name, 'price', s.price, 'photo_url', s.photo_url,
                   'product_url', s.product_url, 'picked', s.picked))
          FROM occ_gift_suggestions(rr.id, 3) s), '[]'::jsonb) END)
        ORDER BY d.occasion_date, d.person) AS items
    FROM due d JOIN fresh f USING (email, occasion_key, occasion_date)
    LEFT JOIN recipients rr ON rr.id = d.recipient_id
    GROUP BY d.email
  LOOP
    PERFORM notify_brevo(jsonb_build_object('event', 'occasion_reminder', 'order_id', 'occasions', 'email', rec.email,
      'days', rec.lead, 'items', rec.items));
    v_sent := v_sent + 1;
  END LOOP;

  -- 2) autopilot (jen kde si ho klient zapnul): 2 dny předem, když nic neobjednal.
  FOR rec IN
    WITH due AS (
      SELECT u.*, r.id AS rid, r.budget, r.gift_prefs, r.note, r.address, r.address_lat, r.address_lng, r.phone, r.name
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

    -- dárek: oblíbený skladem → ze zvolené podkategorie do rozpočtu → žádný (jen kytice)
    v_gift := NULL;
    SELECT * INTO v_gift FROM occ_gift_suggestions(rec.rid, 1);
    -- oblíbené, které teď nejsou skladem (aby florista i klient věděli proč něco jiného)
    SELECT string_agg(pk.product_name, ', ') INTO v_lost
    FROM recipient_gift_picks pk
    WHERE pk.recipient_id = rec.rid
      AND NOT EXISTS (SELECT 1 FROM gift_products() g WHERE g.name = pk.product_name AND g.available);
    v_with_flowers := v_gift.name IS NULL OR 'kytice' = ANY(coalesce(rec.gift_prefs, '{}'))
      OR 'na_vas' = ANY(coalesce(rec.gift_prefs, '{}')) OR cardinality(coalesce(rec.gift_prefs, '{}')) = 0;
    v_what := concat_ws(' + ',
      CASE WHEN v_gift.name IS NOT NULL THEN v_gift.name || coalesce(' (' || v_gift.price::int || ' Kč)', '') END,
      CASE WHEN v_with_flowers THEN CASE WHEN v_gift.name IS NOT NULL THEN 'kytice za zbytek rozpočtu' ELSE 'kytice na uvážení floristy' END END);

    v_missing := concat_ws(', ',
      CASE WHEN coalesce(rec.budget, 0) <= 0 THEN 'rozpočet' END,
      CASE WHEN coalesce(rec.address, '') = '' THEN 'adresa' END,
      CASE WHEN coalesce(rec.phone, '') = '' THEN 'telefon příjemce' END);

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

    v_products := '[]'::jsonb;
    IF v_gift.name IS NOT NULL THEN
      v_products := v_products || jsonb_build_object('name', v_gift.name, 'price', coalesce(v_gift.price, 0)::text, 'quantity', 1);
    END IF;
    IF v_with_flowers THEN
      v_products := v_products || jsonb_build_object('name', 'Kytice – na uvážení floristy',
        'price', greatest(coalesce(rec.budget, 0) - coalesce(v_gift.price, 0), 0)::text, 'quantity', 1);
    END IF;

    INSERT INTO tilda_orders (order_id, customer_email, recipient_name, recipient_phone, address,
      recipient_lat, recipient_lng, delivery_date, delivery_type, products_text, goods_total, order_total,
      payment_method, payment_status, used_deposit, raw_payload, manager_comment, status)
    VALUES (v_order_id, rec.email, rec.name, nullif(rec.phone, ''), nullif(rec.address, ''),
      rec.address_lat, rec.address_lng, rec.occasion_date, 'Doručení kurýrem (autopilot)',
      'Autopilot: ' || rec.title || ' – ' || rec.name || E'\n' || v_what,
      coalesce(rec.budget, 0), coalesce(rec.budget, 0),
      'deposit', CASE WHEN v_paid THEN '🟢 Оплачено' ELSE '🟠 Ожидает оплаты' END,
      CASE WHEN v_paid THEN rec.budget ELSE 0 END,
      jsonb_build_object('payment', jsonb_build_object('products', v_products, 'amount', coalesce(rec.budget, 0)::text)),
      '🤖 АВТОПИЛОТ (клиент сам ничего не выбрал)' ||
        E'\nПовод: ' || rec.title || CASE WHEN rec.years IS NOT NULL THEN ' (' || rec.years || ')' ELSE '' END ||
        E'\nЧто отправить: ' || v_what ||
        CASE WHEN v_gift.picked THEN ' (клиент сам отметил этот подарок)' ELSE '' END ||
        coalesce(E'\nОтмеченных клиентом нет в наличии: ' || v_lost, '') ||
        E'\nБюджет: ' || coalesce(rec.budget::text || ' Kč', 'не указан') ||
        coalesce(E'\nПожелания: ' || nullif(rec.note, ''), '') ||
        E'\nОплата: ' || CASE WHEN v_paid THEN 'списано с депозита' ELSE 'ждём (на депозите не хватает) — клиенту ушло сообщение в чат' END ||
        CASE WHEN v_missing <> '' THEN E'\nНЕ ХВАТАЕТ: ' || v_missing || ' — уточнить у клиента в чате' ELSE '' END,
      'new')
    ON CONFLICT DO NOTHING;

    v_body := '🤖 Autopilot: na ' || to_char(rec.occasion_date, 'DD. MM.') || ' (' || rec.title || ' – ' || rec.name || ') ' ||
      'jste zatím nic nevybrali, tak dárek připravíme my: ' || v_what ||
      CASE WHEN coalesce(rec.budget, 0) > 0 THEN ', celkem do ' || rec.budget || ' Kč' ELSE '' END || '. ' ||
      CASE WHEN v_lost IS NOT NULL THEN 'Vaše oblíbené (' || v_lost || ') teď bohužel nemáme skladem. ' ELSE '' END ||
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
