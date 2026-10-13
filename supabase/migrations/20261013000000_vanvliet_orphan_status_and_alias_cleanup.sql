-- Dve oshibki sopostavleniya s Van Vliet, iz-za kotorykh tovar, u kotorogo
-- sopostavlenie ubrali, ostavalsya na sajte.
--
-- 1) "Zavisshij" status. Skaner (vanvliet-stock-scan) obnovlyaet
--    vanvliet_in_stock tolko u tovarov, u kotorykh est khotya by odin alias;
--    esli alias udalit (v paneli menedzhera), status "est u postavshchika"
--    i vanvliet_cheapest_price ostayutsya starymi navsegda, a sajt pryachet
--    ohapku tolko pri "net u postavshchika" ili pustom statuse. Tak
--    Pivonka Red Charm / Sarah Bernard ostalis vidny posle udaleniya
--    obshchej svyazki. Teper kazhdye 10 minut status tovara bez alias
--    sbrasyvaetsya v "ne proveren" (NULL) - dlya sajta eto "net istochnika".
--    Tovary "Pod zakaz" (special_order) i s ostatkom etim ne zatragivayutsya.
--
-- 2) Starye alias s razmerom v nazvanii ("... bowl of cream 55cm"). Skaner
--    sravnivaet alias s nazvaniem iz kataloga BEZ razmera/granovki/shtuk, tak
--    chto alias s "55cm" nikogda ne sovpadet. Privodim vse alias k tomu zhe
--    vidu, chto i kataloga (te zhe pravila, chto coreName v skanere), dubli
--    posle etogo udalyaem.

-- --- 2) ochistka alias ---
DO $do$
BEGIN
  -- dubli, kotorye stanut odinakovymi posle normalizacii: ostavlyaem odin
  DELETE FROM product_name_aliases a
  USING product_name_aliases b
  WHERE a.id <> b.id
    AND a.product_sticker_id = b.product_sticker_id
    AND a.supplier_id IS NOT DISTINCT FROM b.supplier_id
    AND btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(a.alias),
          '\(\s*imp\s*\)', ' ', 'g'),
          '\(\s*[0-9]+\s*\)', ' ', 'g'),
          '[0-9]+([.,][0-9]+)?\s*(cm|gram)\y', ' ', 'g'),
          '[0-9]+\s*st\y', ' ', 'g'),
          '\s+', ' ', 'g'))
      = btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(b.alias),
          '\(\s*imp\s*\)', ' ', 'g'),
          '\(\s*[0-9]+\s*\)', ' ', 'g'),
          '[0-9]+([.,][0-9]+)?\s*(cm|gram)\y', ' ', 'g'),
          '[0-9]+\s*st\y', ' ', 'g'),
          '\s+', ' ', 'g'))
    AND (a.is_manual < b.is_manual OR (a.is_manual = b.is_manual AND a.id < b.id));

  UPDATE product_name_aliases
  SET alias = btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(alias,
        '\(\s*imp\s*\)', ' ', 'gi'),
        '\(\s*[0-9]+\s*\)', ' ', 'g'),
        '[0-9]+([.,][0-9]+)?\s*(cm|gram)\y', ' ', 'gi'),
        '[0-9]+\s*st\y', ' ', 'gi'),
        '\s+', ' ', 'g'))
  WHERE alias ~* '[0-9]+([.,][0-9]+)?\s*(cm|gram)\y'
     OR alias ~* '[0-9]+\s*st\y'
     OR alias ~* '\(\s*imp\s*\)'
     OR alias ~ '\(\s*[0-9]+\s*\)';
END
$do$;

-- --- 1) tovary bez alias ---
CREATE OR REPLACE FUNCTION public.reset_vanvliet_status_without_alias()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier uuid := (SELECT id FROM suppliers WHERE name = 'Van Vliet');
  v_count integer;
BEGIN
  UPDATE product_stickers ps
  SET vanvliet_in_stock = NULL,
      vanvliet_stock_checked_at = NULL,
      vanvliet_cheapest_price = NULL
  WHERE ps.category = 'ohapka'
    AND (ps.vanvliet_in_stock IS NOT NULL OR ps.vanvliet_cheapest_price IS NOT NULL OR ps.vanvliet_stock_checked_at IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM product_name_aliases a
      WHERE a.product_sticker_id = ps.id AND a.supplier_id = v_supplier
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_vanvliet_status_without_alias() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_vanvliet_status_without_alias() TO service_role;

SELECT public.reset_vanvliet_status_without_alias();
SELECT cron.schedule('vanvliet-reset-orphans', '*/10 * * * *', $$SELECT reset_vanvliet_status_without_alias()$$);
