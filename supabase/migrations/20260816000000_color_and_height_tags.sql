-- Цвет и высота — ещё две независимые оси тегов поверх flower_type, для
-- того же кастомного фильтра "Охапки" на сайте.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS height text;

-- Одна общая функция вместо трёх отдельных — сайту нужен один запрос,
-- чтобы получить сразу все теги на все товары.
DROP FUNCTION IF EXISTS public.get_flower_types();
DROP FUNCTION IF EXISTS public.get_product_tags();
CREATE OR REPLACE FUNCTION public.get_product_tags()
RETURNS TABLE(product_name text, flower_type text, color text, height text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT product_name, flower_type, color, height
  FROM product_stickers
  WHERE archived = false AND (flower_type IS NOT NULL OR color IS NOT NULL OR height IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION public.get_product_tags() TO anon, authenticated;
