-- Живая синхронизация цены прямо с витрины Tilda: у Tilda нет API,
-- которое отдало бы цену напрямую, но цена уже отрисована в браузере
-- у любого посетителя каталога — скрипт на странице читает её из DOM
-- (то же место, откуда уже читаются теги для фильтра) и присылает
-- сюда. Обновляем только price/order_unit_size у существующего товара
-- по названию — ничего больше эта функция делать не может, безопасно
-- вызывать с анонимным ключом с сайта.
--
-- product_stickers.product_name хранится с HTML-сущностями для
-- ударных гласных (например "Hortenezie bil&aacute;"), а браузер в
-- textContent отдаёт уже раскодированный текст ("Hortenezie bilá") —
-- без декодирования тут они никогда не совпадут.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS price numeric;

CREATE OR REPLACE FUNCTION public.decode_html_entities(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(replace(replace(replace(
          replace(replace(replace(replace(replace(replace(
            input,
            '&aacute;', 'á'), '&Aacute;', 'Á'),
            '&eacute;', 'é'), '&Eacute;', 'É'),
            '&iacute;', 'í'), '&Iacute;', 'Í'),
            '&oacute;', 'ó'), '&Oacute;', 'Ó'),
            '&uacute;', 'ú'), '&Uacute;', 'Ú'),
            '&yacute;', 'ý'), '&Yacute;', 'Ý');
$$;

CREATE OR REPLACE FUNCTION public.sync_product_price(p_product_name text, p_price numeric, p_order_unit_size int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_price IS NULL OR p_price <= 0 THEN
    RETURN;
  END IF;

  UPDATE product_stickers
  SET price = p_price,
      order_unit_size = COALESCE(NULLIF(p_order_unit_size, 0), order_unit_size)
  WHERE decode_html_entities(product_name) = p_product_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_product_price(text, numeric, int) TO anon, authenticated;
