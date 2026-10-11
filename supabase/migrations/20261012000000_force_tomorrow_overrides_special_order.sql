-- Ручная плашка "Doručíme zítra" теперь перебивает "под заказ".
--
-- Раньше кнопка "Плашка «Доставим завтра»" в приложении работала только у товаров
-- без special_order. Теперь её можно включить у любого товара, и пока она включена,
-- товар ведёт себя как обычный "завтра": на сайте синяя плашка вместо красной даты,
-- в корзине обычная ближайшая дата доставки (без +отгрузки поставщиком).
--
-- Сам special_order НЕ трогаем и не стираем (его ставит менеджер или триггер
-- recompute_set_special_order для сетов с нехваткой цветка): выключил плашку "завтра" —
-- и товар сразу снова "под заказ", как был. Видимость карточки (unsourceable)
-- по-прежнему считается по настоящему special_order, чтобы плашка не спрятала и не
-- показала лишнего. Всё остальное (остатки, product_availability, скрытие) не меняется.
--
-- Эффективное "под заказ" = special_order AND NOT force_tomorrow. Меняется в трёх
-- местах, которые обязаны совпадать: get_catalog_page_data (плашка в каталоге),
-- get_special_order_products (блок дат на /payment), gift_min_date (подарки в БД).

-- 1) каталог: правим только блок 'special' в боевом определении функции
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.get_catalog_page_data'::regproc);
  v_old text := 'FROM product_stickers WHERE special_order = true AND archived = false';
  v_new text := 'FROM product_stickers WHERE special_order = true AND force_tomorrow = false AND archived = false';
BEGIN
  IF position(v_new IN v_def) > 0 THEN
    RETURN; -- уже применено
  END IF;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'get_catalog_page_data: блок special не найден, определение изменилось';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- 2) блок дат доставки на /payment
CREATE OR REPLACE FUNCTION public.get_special_order_products()
 RETURNS TABLE(product_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT product_name FROM product_stickers
  WHERE special_order = true AND force_tomorrow = false AND archived = false;
$function$;

-- 3) минимальная дата подарка
CREATE OR REPLACE FUNCTION public.gift_min_date(p_order_id text)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_d date := (now() AT TIME ZONE 'Europe/Prague')::date;
  v_special boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM tilda_orders o,
         jsonb_array_elements(coalesce(o.raw_payload->'payment'->'products', '[]'::jsonb)) pr
    JOIN product_stickers ps ON ps.special_order AND NOT ps.force_tomorrow AND NOT ps.archived
      AND decode_html_entities(ps.product_name) = decode_html_entities(pr->>'name')
    WHERE o.order_id = p_order_id
  ) INTO v_special;

  IF v_special THEN
    -- den odeslani: prvni pracovni den (po-pa) po dnesku
    LOOP
      v_d := v_d + 1;
      EXIT WHEN extract(isodow FROM v_d) < 6;
    END LOOP;
  END IF;
  -- doruceni: dalsi den, nebo nejblizsi otevreny den po nem
  LOOP
    v_d := v_d + 1;
    EXIT WHEN NOT gift_day_closed(v_d);
  END LOOP;
  RETURN v_d;
END $function$;
