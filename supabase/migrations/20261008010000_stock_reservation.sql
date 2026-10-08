-- Резерв остатка под подтверждённые заказы.
--
-- Проблема: клиент заказал 10 дельфиниумов (доставка через 2 дня), но остаток
-- в базе уменьшается только при сборке заказа — сайт всё это время продолжал
-- показывать "Doručíme dnes" и "Zbývá N ks", и тот же остаток можно было
-- продать второй раз. У Tilda своего счётчика остатка нет (quantity пустой у
-- всех товаров), поэтому весь остаток на сайте — это наши данные.
--
-- Решение: физический остаток (product_stickers.quantity) и склад не
-- трогаем — он по-прежнему списывается при сборке. Отдельно считаем резерв:
-- сколько стеблей обещано заказам, которые менеджер подтвердил, но которые
-- ещё не собраны (confirmed / courier_assigned / assembling; при сборке
-- остаток списывается и статус становится assembled, поэтому двойного счёта
-- нет). Свободно = на складе - резерв. Резерв считается на лету, ничего не
-- хранится, поэтому нечему рассинхронизироваться.
--
-- Позиции заказа:
--   * новый формат Tilda (есть portion): quantity уже в штуках;
--   * старый формат и касса (нет portion): quantity — число упаковок по
--     order_unit_size штук;
--   * сет/букет: по составу (product_recipes), ingredient без своего товара
--     (имя из Van Vliet) не считается — у него нет остатка.
CREATE OR REPLACE FUNCTION public.get_reserved_stock()
 RETURNS TABLE (product_sticker_id uuid, reserved numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT sticker_id, CASE WHEN in_pieces THEN qty ELSE qty * order_unit_size END AS x
    FROM matched WHERE category = 'ohapka'
    UNION ALL
    SELECT r.ingredient_sticker_id, r.quantity_needed * m.qty
    FROM matched m JOIN product_recipes r ON r.bouquet_sticker_id = m.sticker_id
    WHERE m.category IS DISTINCT FROM 'ohapka' AND r.ingredient_sticker_id IS NOT NULL
  ) u
  GROUP BY u.sticker_id;
$function$;

-- Менеджерскому приложению можно, публичному сайту напрямую нельзя (спрос по
-- товарам незачем показывать наружу); сайт получает результат через
-- get_catalog_page_data, которая выполняется от имени владельца.
REVOKE ALL ON FUNCTION public.get_reserved_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reserved_stock() TO authenticated, service_role;

-- Данные каталога для сайта: свободный остаток вместо физического.
--   unsourceable — охапка скрывается, когда свободного нет и у Van Vliet нет;
--   available    — "Doručíme dnes" у охапок по свободному остатку (для
--                  остального по-прежнему product_availability + ручная
--                  плашка force_tomorrow);
--   badges       — "Zbývá N ks" по свободному остатку.
-- При пустом резерве ответ совпадает с прежним (проверено на боевых данных).
-- В ветке product_availability архивные охапки не исключаем — у них могут
-- остаться старые строки, и раньше они проходили как есть.
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
      )
    ),
    'available', (
      SELECT coalesce(json_agg(n), '[]'::json) FROM (
        SELECT ps.product_name AS n
        FROM product_stickers ps
        LEFT JOIN res r ON r.product_sticker_id = ps.id
        WHERE ps.category = 'ohapka'
          AND ps.archived = false
          AND ps.force_tomorrow = false
          AND COALESCE(ps.quantity, 0) - COALESCE(r.reserved, 0) > 0
        UNION ALL
        SELECT pa.product_name
        FROM product_availability pa
        WHERE NOT EXISTS (
            SELECT 1 FROM product_stickers ps
            WHERE ps.category = 'ohapka' AND ps.archived = false
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
      ) x
    ),
    'special', (
      SELECT coalesce(json_agg(product_name), '[]'::json)
      FROM product_stickers WHERE special_order = true AND archived = false
    ),
    'badges', (
      SELECT coalesce(json_agg(json_build_object(
        'product_name', ps.product_name,
        'badge_text', ps.badge_text,
        'badge_color', ps.badge_color,
        'quantity', CASE
          WHEN ps.category = 'ohapka' AND ps.quantity IS NOT NULL
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
