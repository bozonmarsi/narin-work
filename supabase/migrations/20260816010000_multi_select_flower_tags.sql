-- flower_type и color переводим с одиночного значения на массив — товар
-- может быть одновременно, например, "Ranunkulus" И "Vytrvalé", или
-- "Bílá" И "Růžová" (двухцветный букет). Полезно для фильтра на сайте,
-- где человек сможет комбинировать несколько отметок сразу.
ALTER TABLE product_stickers
  ALTER COLUMN flower_type TYPE text[] USING (CASE WHEN flower_type IS NULL THEN NULL ELSE ARRAY[flower_type] END);
ALTER TABLE product_stickers
  ALTER COLUMN color TYPE text[] USING (CASE WHEN color IS NULL THEN NULL ELSE ARRAY[color] END);

DROP FUNCTION IF EXISTS public.get_product_tags();
CREATE OR REPLACE FUNCTION public.get_product_tags()
RETURNS TABLE(product_name text, flower_type text[], color text[], height text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT product_name, flower_type, color, height
  FROM product_stickers
  WHERE archived = false
    AND (flower_type IS NOT NULL OR color IS NOT NULL OR height IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION public.get_product_tags() TO anon, authenticated;
