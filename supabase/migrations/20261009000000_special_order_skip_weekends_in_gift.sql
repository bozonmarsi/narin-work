-- Zboží na speciální objednávku (objednáváme ze zahraničí): dodavatel odesílá v první
-- pracovní den (po-pá) po objednávce, zboží je u nás další den a doručujeme ten den,
-- je-li otevřeno, jinak nejbližší otevřený den. Objednávka ve čtvrtek je tedy hotová
-- v sobotu (odesláno v pátek), objednávka v pátek až v úterý (odesláno v pondělí),
-- ne v pondělí. Stejné pravidlo je v katalogu (plaketa "Doruceme ..."), na pokladně
-- (checkout-date-blocker.html) a tady — musí se měnit všechna tři místa najednou,
-- jinak by stránka příjemce dárku nabízela jiný den než pokladna.
-- Běžné zboží se nemění: nejdřív zítra, jakýkoli otevřený den.
-- SECURITY DEFINER a search_path zůstávají (funkci volá anonymní klíč z webu).
CREATE OR REPLACE FUNCTION gift_min_date(p_order_id text)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    -- den odeslání: první pracovní den (po-pá, ne zavřený) po dnešku
    LOOP
      v_d := v_d + 1;
      EXIT WHEN extract(isodow FROM v_d) < 6 AND NOT gift_day_closed(v_d);
    END LOOP;
  END IF;
  -- doručení: další den, nebo nejbližší otevřený den po něm
  LOOP
    v_d := v_d + 1;
    EXIT WHEN NOT gift_day_closed(v_d);
  END LOOP;
  RETURN v_d;
END $$;
