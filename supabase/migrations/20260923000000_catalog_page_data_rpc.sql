-- Страница каталога на сайте раньше делала 3 независимых Zero Block'а,
-- каждый со своим fetch: catalog-filter.html тянуло get_product_tags +
-- get_unsourceable_products, catalog-availability-badges.html — ТЕ ЖЕ
-- get_unsourceable_products (второй раз!) плюс get_available_products,
-- get_special_order_products и две таблицы, catalog-custom-badges.html —
-- get_product_badges. Итого 7 отдельных сетевых запросов на открытие
-- страницы, один из них дублируется. Здесь — то же самое одним JSON,
-- один round-trip. Старые функции не трогаем (их использует и панель
-- менеджера) — это чисто дополнительная, бьющая по тем же таблицам.
CREATE OR REPLACE FUNCTION public.get_catalog_page_data()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'tags', (
      SELECT coalesce(json_agg(json_build_object(
        'product_name', product_name,
        'category', category,
        'flower_type', flower_type,
        'color', color,
        'height', height,
        'fragrant', fragrant
      )), '[]'::json)
      FROM product_stickers WHERE archived = false
    ),
    'unsourceable', (
      SELECT coalesce(json_agg(product_name), '[]'::json)
      FROM product_stickers
      WHERE archived = false AND (
        manually_hidden = true
        OR (
          category = 'ohapka'
          AND special_order = false
          AND COALESCE(quantity, 0) <= 0
          AND COALESCE(vanvliet_in_stock, false) = false
        )
      )
    ),
    'available', (
      SELECT coalesce(json_agg(product_name), '[]'::json) FROM product_availability
    ),
    'special', (
      SELECT coalesce(json_agg(product_name), '[]'::json)
      FROM product_stickers WHERE special_order = true AND archived = false
    ),
    'badges', (
      SELECT coalesce(json_agg(json_build_object(
        'product_name', product_name,
        'badge_text', badge_text,
        'badge_color', badge_color,
        'quantity', quantity
      )), '[]'::json)
      FROM product_stickers
      WHERE archived = false
        AND ((badge_text IS NOT NULL AND badge_text <> '') OR quantity IS NOT NULL)
    ),
    'closed_weekdays', (
      SELECT coalesce(json_agg(weekday), '[]'::json) FROM shop_weekly_closed_days
    ),
    'closed_dates', (
      SELECT coalesce(json_agg(closed_date), '[]'::json) FROM shop_closed_dates
    )
  );
$$;
