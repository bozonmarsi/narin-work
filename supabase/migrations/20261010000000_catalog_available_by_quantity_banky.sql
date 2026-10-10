-- Kovky / kytice: "v nalichii" po kolichestvu, a ne tolko po ruchnomu pereklyuchatelyu.
--
-- Problema: u ohapok "Doruchime dnes" schitaetsya po ostatku, a u kovok i
-- kytic - tolko po product_availability (ruchnoj pereklyuchatel). Menedzher
-- stavit v prilozhenii kolichestvo 1, na sajte poyavlyaetsya "Zbyva 1 ks", no
-- ryadom "Doruchime zitra" - dva plashki protivorechat drug drugu.
--
-- Teper dlya kategorij banky / buket: esli kolichestvo zadano (ne NULL), to
-- "dnes" kogda ono > 0 (i ne vklyuchen force_tomorrow), inache "zitra".
-- Esli kolichestvo ne zadano - kak ranshe, po product_availability.
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.get_catalog_page_data()'::regprocedure);
  v_new text;
  a1 text := E'          AND COALESCE(ps.quantity, 0) - COALESCE(r.reserved, 0) > 0\n        UNION ALL\n        SELECT pa.product_name';
  a2 text := E'      ) x\n    ),\n    ''special''';
BEGIN
  IF position(a1 in v_def) = 0 OR position(a2 in v_def) = 0 THEN
    RAISE EXCEPTION 'get_catalog_page_data: anchors not found, definition changed';
  END IF;

  v_new := replace(v_def, a1,
    E'          AND COALESCE(ps.quantity, 0) - COALESCE(r.reserved, 0) > 0\n'
    || E'        UNION ALL\n'
    || E'        SELECT ps.product_name\n'
    || E'        FROM product_stickers ps\n'
    || E'        WHERE ps.category IN (''banky'', ''buket'')\n'
    || E'          AND ps.archived = false\n'
    || E'          AND ps.force_tomorrow = false\n'
    || E'          AND COALESCE(ps.quantity, 0) > 0\n'
    || E'        UNION ALL\n'
    || E'        SELECT pa.product_name');

  v_new := replace(v_new, a2,
    E'          AND NOT EXISTS (\n'
    || E'            SELECT 1 FROM product_stickers ps\n'
    || E'            WHERE ps.category IN (''banky'', ''buket'') AND ps.quantity IS NOT NULL AND ps.archived = false\n'
    || E'              AND pa.product_name IN (\n'
    || E'                ps.product_name,\n'
    || E'                replace(replace(replace(replace(ps.product_name, ''&aacute;'', ''á''), ''&yacute;'', ''ý''), ''&iacute;'', ''í''), ''&eacute;'', ''é'')\n'
    || E'              )\n'
    || E'          )\n'
    || a2);

  EXECUTE v_new;
END
$do$;
