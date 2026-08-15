-- Аромат — простой да/нет тег (не список вариантов), четвёртая ось
-- фильтра для "Охапки" на сайте.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS fragrant boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_product_tags();
CREATE OR REPLACE FUNCTION public.get_product_tags()
RETURNS TABLE(product_name text, flower_type text[], color text[], height text, fragrant boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT product_name, flower_type, color, height, fragrant
  FROM product_stickers
  WHERE archived = false
    AND (flower_type IS NOT NULL OR color IS NOT NULL OR height IS NOT NULL OR fragrant = true);
$$;

GRANT EXECUTE ON FUNCTION public.get_product_tags() TO anon, authenticated;
