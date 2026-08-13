-- Per-product flag for items that are never in same/next-day stock (e.g.
-- special-order flowers sourced from the Netherlands) — a standing property
-- of the product, not a daily toggle like product_availability. The catalog
-- badge shows a computed delivery date instead of "dnes/zítra" for these.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS special_order boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_special_order_products();
CREATE OR REPLACE FUNCTION public.get_special_order_products()
RETURNS TABLE(product_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT product_name FROM product_stickers WHERE special_order = true AND archived = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_special_order_products() TO anon, authenticated;
