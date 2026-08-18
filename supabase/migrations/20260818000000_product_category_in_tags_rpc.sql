-- Каталог теперь строится как единая вкладочная навигация (Vše/Náruče/
-- Sety/Kolekce/Banky) поверх одной Тильда-категории — скрипту на сайте
-- нужно знать category каждого товара, а не только вторичные метки.
-- Заодно убираем фильтр "только с тегами", чтобы товары без вторичных
-- меток (тип/цвет/высота/аромат), но с проставленной категорией, всё
-- равно попадали в нужную вкладку.
DROP FUNCTION IF EXISTS public.get_product_tags();
CREATE OR REPLACE FUNCTION public.get_product_tags()
RETURNS TABLE(product_name text, category text, flower_type text[], color text[], height text, fragrant boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT product_name, category, flower_type, color, height, fragrant
  FROM product_stickers
  WHERE archived = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_tags() TO anon, authenticated;
