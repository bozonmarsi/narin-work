-- Stabilized flowers: stock is counted automatically, like the Náruče.
--  * the manager enters the count with the +/- stepper in "Магазин" (product_stickers.quantity);
--  * a confirmed order reserves pieces, so the free stock drops at once;
--  * free stock 0 hides the product from the catalog and blocks it on /payment
--    (unless the manager marked it "под заказ");
--  * at dispatch the sold pieces leave the stock. These products have no deliveries in
--    "Приёмка", so deduct_order_stock opens a small service batch for the sale.

create or replace function public.get_reserved_stock()
 returns table(product_sticker_id uuid, reserved numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  WITH lines AS (
    SELECT p->>'name' AS name,
           coalesce(nullif(p->>'quantity', '')::numeric, 1) AS qty,
           coalesce(nullif(p->>'portion', '')::numeric, 0) > 0 AS in_pieces
    FROM tilda_orders o
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.raw_payload->'payment'->'products') = 'array'
           THEN o.raw_payload->'payment'->'products' ELSE '[]'::jsonb END
    ) p
    WHERE o.status IN ('confirmed', 'courier_assigned', 'assembling')
  ), matched AS (
    SELECT l.qty, l.in_pieces, s.id AS sticker_id, s.category, s.order_unit_size
    FROM lines l
    JOIN product_stickers s ON s.archived = false AND (
      s.product_name = l.name
      OR replace(replace(replace(replace(s.product_name, '&aacute;', 'á'), '&yacute;', 'ý'), '&iacute;', 'í'), '&eacute;', 'é') = l.name
    )
  )
  SELECT u.sticker_id, sum(u.x)::numeric
  FROM (
    SELECT sticker_id, CASE WHEN in_pieces OR category = 'stabilizovane' THEN qty ELSE qty * order_unit_size END AS x
    FROM matched WHERE category IN ('ohapka', 'stabilizovane')
    UNION ALL
    SELECT r.ingredient_sticker_id, r.quantity_needed * m.qty
    FROM matched m JOIN product_recipes r ON r.bouquet_sticker_id = m.sticker_id
    WHERE coalesce(m.category, '') NOT IN ('ohapka', 'stabilizovane') AND r.ingredient_sticker_id IS NOT NULL
  ) u
  GROUP BY u.sticker_id;
$function$;

create or replace function public.deduct_order_stock(p_order_id uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  need record;
  b record;
  v_left numeric;
  v_take numeric;
  v_total numeric := 0;
  v_stock numeric;
  v_batch uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_type = 'order' AND reference_id = p_order_id AND reason = 'sold'
  ) THEN
    RETURN 0;
  END IF;

  FOR need IN
    WITH lines AS (
      SELECT p->>'name' AS name,
             coalesce(nullif(p->>'quantity', '')::numeric, 1) AS qty,
             coalesce(nullif(p->>'portion', '')::numeric, 0) > 0 AS in_pieces
      FROM tilda_orders o
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(o.raw_payload->'payment'->'products') = 'array'
             THEN o.raw_payload->'payment'->'products' ELSE '[]'::jsonb END
      ) p
      WHERE o.id = p_order_id
    ), matched AS (
      SELECT l.qty, l.in_pieces, s.id AS sticker_id, s.category, s.order_unit_size
      FROM lines l
      JOIN product_stickers s ON s.archived = false AND (
        s.product_name = l.name
        OR replace(replace(replace(replace(s.product_name, '&aacute;', 'á'), '&yacute;', 'ý'), '&iacute;', 'í'), '&eacute;', 'é') = l.name
      )
    )
    SELECT u.sticker_id, sum(u.x) AS stems
    FROM (
      SELECT sticker_id, CASE WHEN in_pieces OR category = 'stabilizovane' THEN qty ELSE qty * order_unit_size END AS x
      FROM matched WHERE category IN ('ohapka', 'stabilizovane')
      UNION ALL
      SELECT r.ingredient_sticker_id, r.quantity_needed * m.qty
      FROM matched m JOIN product_recipes r ON r.bouquet_sticker_id = m.sticker_id
      WHERE coalesce(m.category, '') NOT IN ('ohapka', 'stabilizovane') AND r.ingredient_sticker_id IS NOT NULL
    ) u
    GROUP BY u.sticker_id
  LOOP
    v_left := need.stems;
    FOR b IN
      SELECT id, remaining FROM batches
      WHERE product_sticker_id = need.sticker_id AND remaining > 0
      ORDER BY purchase_date, created_at
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := least(b.remaining, v_left);
      INSERT INTO stock_movements (batch_id, change_qty, reason, reference_type, reference_id, notes)
      VALUES (b.id, -v_take, 'sold', 'order', p_order_id, 'авто-списание при отправке/доставке');
      v_left := v_left - v_take;
      v_total := v_total + v_take;
    END LOOP;

    -- Stabilized flowers are counted by hand, without deliveries: the batch exists only
    -- to carry this sale, so the order stays protected from a second deduction.
    IF v_left > 0 THEN
      SELECT coalesce(quantity, 0) INTO v_stock FROM product_stickers
      WHERE id = need.sticker_id AND category = 'stabilizovane';
      IF coalesce(v_stock, 0) > 0 THEN
        v_take := least(v_left, v_stock);
        INSERT INTO batches (product_sticker_id, quantity_received, remaining)
        VALUES (need.sticker_id, v_take, v_take)
        RETURNING id INTO v_batch;
        INSERT INTO stock_movements (batch_id, change_qty, reason, reference_type, reference_id, notes)
        VALUES (v_batch, -v_take, 'sold', 'order', p_order_id, 'авто-списание при отправке/доставке');
        v_total := v_total + v_take;
      END IF;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$function$;

create or replace function public.get_unsourceable_products()
 returns table(product_name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT product_name FROM product_stickers
  WHERE archived = false
    AND (
      manually_hidden = true
      OR (
        category = 'ohapka'
        AND special_order = false
        AND COALESCE(quantity, 0) <= 0
        AND COALESCE(vanvliet_in_stock, false) = false
      )
      OR (
        category = 'stabilizovane'
        AND special_order = false
        AND COALESCE(quantity, 0) <= 0
      )
    );
$function$;

create or replace function public.tg_sync_ohapka_availability()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  IF NEW.category IN ('ohapka', 'stabilizovane') AND (OLD.quantity IS DISTINCT FROM NEW.quantity) THEN
    IF COALESCE(NEW.quantity, 0) > 0 THEN
      INSERT INTO product_availability (product_name, updated_at)
      VALUES (NEW.product_name, now())
      ON CONFLICT (product_name) DO UPDATE SET updated_at = now();
    ELSE
      DELETE FROM product_availability WHERE product_name = NEW.product_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_catalog_page_data()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH res AS (
    SELECT product_sticker_id, reserved FROM get_reserved_stock()
  )
  SELECT json_build_object(
    'tags', (
      SELECT coalesce(json_agg(json_build_object(
        'product_name', product_name,
        'category', category,
        'flower_type', flower_type,
        'color', color,
        'height', height,
        'fragrant', fragrant,
        'image_url', image_url,
        'price', price,
        'tilda_uid', tilda_uid,
        'tilda_url', tilda_url
      )), '[]'::json)
      FROM product_stickers WHERE archived = false
    ),
    'unsourceable', (
      SELECT coalesce(json_agg(ps.product_name), '[]'::json)
      FROM product_stickers ps
      LEFT JOIN res r ON r.product_sticker_id = ps.id
      WHERE ps.archived = false AND (
        ps.manually_hidden = true
        OR (
          ps.category = 'ohapka'
          AND ps.special_order = false
          AND COALESCE(ps.quantity, 0) - COALESCE(r.reserved, 0) <= 0
          AND COALESCE(ps.vanvliet_in_stock, false) = false
        )
        OR (
          ps.category = 'stabilizovane'
          AND ps.special_order = false
          AND COALESCE(ps.quantity, 0) - COALESCE(r.reserved, 0) <= 0
        )
      )
    ),
    'available', (
      SELECT coalesce(json_agg(n), '[]'::json) FROM (
        SELECT ps.product_name AS n
        FROM product_stickers ps
        LEFT JOIN res r ON r.product_sticker_id = ps.id
        WHERE ps.category IN ('ohapka', 'stabilizovane')
          AND ps.archived = false
          AND ps.force_tomorrow = false
          AND COALESCE(ps.quantity, 0) - COALESCE(r.reserved, 0) > 0
        UNION ALL
        SELECT ps.product_name
        FROM product_stickers ps
        WHERE ps.category IN ('banky', 'buket')
          AND ps.archived = false
          AND ps.force_tomorrow = false
          AND COALESCE(ps.quantity, 0) > 0
        UNION ALL
        SELECT pa.product_name
        FROM product_availability pa
        WHERE NOT EXISTS (
            SELECT 1 FROM product_stickers ps
            WHERE ps.category IN ('ohapka', 'stabilizovane') AND ps.archived = false
              AND pa.product_name IN (
                ps.product_name,
                replace(replace(replace(replace(ps.product_name, '&aacute;', 'á'), '&yacute;', 'ý'), '&iacute;', 'í'), '&eacute;', 'é')
              )
          )
          AND NOT EXISTS (
            SELECT 1 FROM product_stickers ps
            WHERE ps.force_tomorrow = true AND ps.archived = false
              AND pa.product_name IN (
                ps.product_name,
                replace(replace(replace(replace(ps.product_name, '&aacute;', 'á'), '&yacute;', 'ý'), '&iacute;', 'í'), '&eacute;', 'é')
              )
          )
          AND NOT EXISTS (
            SELECT 1 FROM product_stickers ps
            WHERE ps.category IN ('banky', 'buket') AND ps.quantity IS NOT NULL AND ps.archived = false
              AND pa.product_name IN (
                ps.product_name,
                replace(replace(replace(replace(ps.product_name, '&aacute;', 'á'), '&yacute;', 'ý'), '&iacute;', 'í'), '&eacute;', 'é')
              )
          )
      ) x
    ),
    'special', (
      SELECT coalesce(json_agg(product_name), '[]'::json)
      FROM product_stickers WHERE special_order = true AND force_tomorrow = false AND archived = false
        AND NOT (category = 'ohapka' AND vanvliet_in_stock IS TRUE)
    ),
    'badges', (
      SELECT coalesce(json_agg(json_build_object(
        'product_name', ps.product_name,
        'badge_text', ps.badge_text,
        'badge_color', ps.badge_color,
        'quantity', CASE
          WHEN ps.category IN ('ohapka', 'stabilizovane') AND ps.quantity IS NOT NULL
          THEN greatest(ps.quantity - COALESCE(r.reserved, 0), 0)
          ELSE ps.quantity
        END
      )), '[]'::json)
      FROM product_stickers ps
      LEFT JOIN res r ON r.product_sticker_id = ps.id
      WHERE ps.archived = false
        AND ((ps.badge_text IS NOT NULL AND ps.badge_text <> '') OR ps.quantity IS NOT NULL)
    ),
    'closed_weekdays', (
      SELECT coalesce(json_agg(weekday), '[]'::json) FROM shop_weekly_closed_days
    ),
    'closed_dates', (
      SELECT coalesce(json_agg(closed_date), '[]'::json) FROM shop_closed_dates
    )
  );
$function$;
