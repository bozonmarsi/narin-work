-- Ручная плашка "Doručíme zítra" на карточке товара на сайте.
--
-- Нужна, когда товар физически есть (остаток > 0, на сайте горит
-- "Doručíme dnes"), а показать надо "завтра" — не обнуляя при этом остаток:
-- обнуление ломает склад и, для охапок без подтверждения у Van Vliet, ещё и
-- скрывает карточку с сайта целиком.
--
-- Поэтому отдельный флаг, который читает ТОЛЬКО get_catalog_page_data:
-- имя товара просто не попадает в список 'available', и сайт сам рисует
-- "завтра" (так он и работает для всего, чего нет в этом списке). Остаток,
-- product_availability, special_order, скрытие и триггеры не трогаются.
-- Флаг выключен у всех по умолчанию, поэтому до первого клика ответ функции
-- совпадает с прежним один в один.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS force_tomorrow boolean NOT NULL DEFAULT false;

-- Определение взято из боевой базы; изменён только блок 'available'.
-- product_availability хранит имя либо как в product_stickers (его пишет
-- триггер для охапок — с &aacute; и т.п.), либо уже раскодированное (его
-- пишет кнопка в приложении), поэтому сравниваем оба варианта.
CREATE OR REPLACE FUNCTION public.get_catalog_page_data()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      SELECT coalesce(json_agg(pa.product_name), '[]'::json)
      FROM product_availability pa
      WHERE NOT EXISTS (
        SELECT 1 FROM product_stickers ps
        WHERE ps.force_tomorrow = true
          AND ps.archived = false
          AND pa.product_name IN (
            ps.product_name,
            replace(replace(replace(replace(ps.product_name, '&aacute;', 'á'), '&yacute;', 'ý'), '&iacute;', 'í'), '&eacute;', 'é')
          )
      )
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
$function$;
