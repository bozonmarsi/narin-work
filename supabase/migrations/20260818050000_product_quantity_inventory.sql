-- Реальный складской учёт (сколько штук приехало/осталось) — отдельно от
-- product_availability (это просто да/нет "есть сегодня"). NULL = учёт по
-- этому товару ещё не ведётся, 0 = явно распродано.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS quantity integer;

-- get_product_badges() теперь отдаёт и quantity — сайту нужно само число,
-- чтобы посчитать автоматическую плашку "Zbývá N ks" / "Vyprodáno", когда
-- менеджер не поставил свою плашку руками.
DROP FUNCTION IF EXISTS public.get_product_badges();
CREATE OR REPLACE FUNCTION public.get_product_badges()
RETURNS TABLE(product_name text, badge_text text, badge_color text, quantity integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT product_name, badge_text, badge_color, quantity
  FROM product_stickers
  WHERE archived = false
    AND ((badge_text IS NOT NULL AND badge_text <> '') OR quantity IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION public.get_product_badges() TO anon, authenticated;
