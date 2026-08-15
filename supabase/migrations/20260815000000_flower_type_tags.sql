-- Тип цветка (Tulipán, Karafiát, Pivoňka, ...) — своя ось тегов отдельно
-- от category (buket/set/ohapka/atelier/otkrytka), в первую очередь нужна
-- для кастомного фильтра на странице каталога "Охапки" на сайте, т.к.
-- встроенный фильтр Тильды не подошёл (не даёт нормально фильтровать по
-- подразделам, только по товарам без категорий вообще).
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS flower_type text;

DROP FUNCTION IF EXISTS public.get_flower_types();
CREATE OR REPLACE FUNCTION public.get_flower_types()
RETURNS TABLE(product_name text, flower_type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT product_name, flower_type FROM product_stickers WHERE flower_type IS NOT NULL AND archived = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_flower_types() TO anon, authenticated;
