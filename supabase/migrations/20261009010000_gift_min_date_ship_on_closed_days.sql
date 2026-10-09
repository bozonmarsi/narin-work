-- Den odeslani od dodavatele se nesmi krast zavrenym dnem obchodu.
--
-- Dodavatel ze zahranici odesila v prvni pracovni den (po-pa) po objednavce,
-- i kdyz je u nas ten den zavreno (pondeli): zbozi je u nas dalsi den.
-- Objednavka v patek tedy prijde v utery (odeslano v pondeli), ne ve stredu.
-- Drive se zavreny den preskakoval i pri odeslani - to davalo stredu.
-- Pravidlo je take v katalogu (plaketa "Dorucime ...") a v checkout-date-
-- blockeru - menit vzdy vsechna tri mista.
CREATE OR REPLACE FUNCTION public.gift_min_date(p_order_id text)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_d date := (now() AT TIME ZONE 'Europe/Prague')::date;
  v_special boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM tilda_orders o,
         jsonb_array_elements(coalesce(o.raw_payload->'payment'->'products', '[]'::jsonb)) pr
    JOIN product_stickers ps ON ps.special_order AND NOT ps.archived
      AND decode_html_entities(ps.product_name) = decode_html_entities(pr->>'name')
    WHERE o.order_id = p_order_id
  ) INTO v_special;

  IF v_special THEN
    -- den odeslani: prvni pracovni den (po-pa) po dnesku
    LOOP
      v_d := v_d + 1;
      EXIT WHEN extract(isodow FROM v_d) < 6;
    END LOOP;
  END IF;
  -- doruceni: dalsi den, nebo nejblizsi otevreny den po nem
  LOOP
    v_d := v_d + 1;
    EXIT WHEN NOT gift_day_closed(v_d);
  END LOOP;
  RETURN v_d;
END $function$;
