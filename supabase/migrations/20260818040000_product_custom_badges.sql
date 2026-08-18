-- Менеджер сам задаёт текст и цвет плашки на карточке товара на сайте
-- (например "Začátek sezóny", "Poslední kusy") — независимо от бейджа
-- наличия dnes/zítra, который считается отдельным скриптом.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS badge_text text;
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS badge_color text;

DROP FUNCTION IF EXISTS public.get_product_badges();
CREATE OR REPLACE FUNCTION public.get_product_badges()
RETURNS TABLE(product_name text, badge_text text, badge_color text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT product_name, badge_text, badge_color
  FROM product_stickers
  WHERE archived = false AND badge_text IS NOT NULL AND badge_text <> '';
$$;

GRANT EXECUTE ON FUNCTION public.get_product_badges() TO anon, authenticated;
