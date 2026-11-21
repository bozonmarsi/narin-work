-- Kovky (banky) a vanocni zbozi (vanoce) se pri prodeji neodepisovaly:
-- deduct_order_stock bral jen ohapka a stabilizovane. Kovka 1 (1 ks) se prodala
-- 19. 11., objednavka dorucena, a na webu je porad "skladem".
-- Ted se kusove zbozi (stabilizovane, banky, vanoce) odepisuje po kusech stejne
-- jako stabilizovane: z rucne zadaneho poctu v Magazinu.
CREATE OR REPLACE FUNCTION public.deduct_order_stock(p_order_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  need record;
  b record;
  v_left numeric;
  v_take numeric;
  v_total numeric := 0;
  v_stock numeric;
  v_batch uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_type = 'order' AND reference_id = p_order_id AND reason = 'sold'
  ) THEN
    RETURN 0;
  END IF;

  FOR need IN
    WITH lines AS (
      SELECT p->>'name' AS name,
             coalesce(nullif(p->>'quantity', '')::numeric, 1) AS qty,
             coalesce(nullif(p->>'portion', '')::numeric, 0) > 0 AS in_pieces
      FROM tilda_orders o
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(o.raw_payload->'payment'->'products') = 'array'
             THEN o.raw_payload->'payment'->'products' ELSE '[]'::jsonb END
      ) p
      WHERE o.id = p_order_id
    ), matched AS (
      SELECT l.qty, l.in_pieces, s.id AS sticker_id, s.category, s.order_unit_size
      FROM lines l
      JOIN product_stickers s ON s.archived = false AND (
        s.product_name = l.name
        OR replace(replace(replace(replace(s.product_name, '&aacute;', 'á'), '&yacute;', 'ý'), '&iacute;', 'í'), '&eacute;', 'é') = l.name
      )
    )
    SELECT u.sticker_id, sum(u.x) AS stems
    FROM (
      SELECT sticker_id, CASE WHEN in_pieces OR category <> 'ohapka' THEN qty ELSE qty * order_unit_size END AS x
      FROM matched WHERE category IN ('ohapka', 'stabilizovane', 'banky', 'vanoce')
      UNION ALL
      SELECT r.ingredient_sticker_id, r.quantity_needed * m.qty
      FROM matched m JOIN product_recipes r ON r.bouquet_sticker_id = m.sticker_id
      WHERE coalesce(m.category, '') NOT IN ('ohapka', 'stabilizovane', 'banky', 'vanoce') AND r.ingredient_sticker_id IS NOT NULL
    ) u
    GROUP BY u.sticker_id
  LOOP
    v_left := need.stems;
    FOR b IN
      SELECT id, remaining FROM batches
      WHERE product_sticker_id = need.sticker_id AND remaining > 0
      ORDER BY purchase_date, created_at
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := least(b.remaining, v_left);
      INSERT INTO stock_movements (batch_id, change_qty, reason, reference_type, reference_id, notes)
      VALUES (b.id, -v_take, 'sold', 'order', p_order_id, 'авто-списание при отправке/доставке');
      v_left := v_left - v_take;
      v_total := v_total + v_take;
    END LOOP;

    -- Piece goods are counted by hand, without deliveries: the batch exists only
    -- to carry this sale, so the order stays protected from a second deduction.
    IF v_left > 0 THEN
      SELECT coalesce(quantity, 0) INTO v_stock FROM product_stickers
      WHERE id = need.sticker_id AND category IN ('stabilizovane', 'banky', 'vanoce');
      IF coalesce(v_stock, 0) > 0 THEN
        v_take := least(v_left, v_stock);
        INSERT INTO batches (product_sticker_id, quantity_received, remaining)
        VALUES (need.sticker_id, v_take, v_take)
        RETURNING id INTO v_batch;
        INSERT INTO stock_movements (batch_id, change_qty, reason, reference_type, reference_id, notes)
        VALUES (v_batch, -v_take, 'sold', 'order', p_order_id, 'авто-списание при отправке/доставке');
        v_total := v_total + v_take;
      END IF;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- Razove: Kovka 1 z objednavky 1251287373 (dorucena 19. 11.) -> 0 ks.
SELECT public.deduct_order_stock(id) FROM tilda_orders
WHERE order_id = '1251287373' AND status = 'delivered';
