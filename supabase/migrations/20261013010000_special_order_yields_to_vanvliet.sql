-- "Pod zakaz" (cherez 2 dnya) ne dolzhen perebivat "zavtra", kogda u Van Vliet
-- tovar na zavtra est.
--
-- Pravilo: ruchnoj flag special_order = zapasnoj variant na sluchaj, kogda
-- postavshchik tovara ne daet. Esli skaner Van Vliet pokazyvaet, chto u nego
-- ohapka est na zavtra (vanvliet_in_stock = true), plashka na sajte i data v
-- korzine - "Doruchime zitra", a ne "cherez 2 dnya". Flag pri etom ne
-- snimaetsya: kogda tovar u postavshchika propadet, "Pod zakaz" vernetsya sam.
-- Kasaetsya tolko ohapok (u setov/buketov svoj avtomat po sostavu).
-- Menyaem vse tri mesta, gde chitaetsya special_order dlya sajta: katalog,
-- korzina (get_special_order_products) i data podarka (gift_min_date).

DO $do$
DECLARE
  v_def text;
  v_new text;
  a1 text := 'WHERE special_order = true AND force_tomorrow = false AND archived = false';
  a2 text := 'JOIN product_stickers ps ON ps.special_order AND NOT ps.force_tomorrow AND NOT ps.archived';
BEGIN
  -- katalog
  v_def := pg_get_functiondef('public.get_catalog_page_data()'::regprocedure);
  IF position(a1 in v_def) = 0 THEN
    RAISE EXCEPTION 'get_catalog_page_data: anchor not found';
  END IF;
  v_new := replace(v_def, a1, a1 || E'\n        AND NOT (category = ''ohapka'' AND vanvliet_in_stock IS TRUE)');
  EXECUTE v_new;

  -- data podarka
  v_def := pg_get_functiondef('public.gift_min_date(text)'::regprocedure);
  IF position(a2 in v_def) = 0 THEN
    RAISE EXCEPTION 'gift_min_date: anchor not found';
  END IF;
  v_new := replace(v_def, a2, a2 || E'\n      AND NOT (ps.category = ''ohapka'' AND ps.vanvliet_in_stock IS TRUE)');
  EXECUTE v_new;
END
$do$;

-- korzina
CREATE OR REPLACE FUNCTION public.get_special_order_products()
 RETURNS TABLE(product_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT product_name FROM product_stickers
  WHERE special_order = true AND force_tomorrow = false AND archived = false
    AND NOT (category = 'ohapka' AND vanvliet_in_stock IS TRUE);
$function$;
