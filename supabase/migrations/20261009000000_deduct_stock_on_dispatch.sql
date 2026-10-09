-- Списание остатка не зависит больше от кнопки "Собрать" на складе.
--
-- Проблема: остаток (stock_movements -> batches.remaining -> product_stickers
-- .quantity) списывался только в модалке сборки OrderAssembleModal. Если заказ
-- уходил дальше без неё (курьер взял и довёз, менеджер сразу поставил
-- "Доставлен"), остаток не менялся ни разу, а резерв после статуса
-- assembling уже не считается - товар снова выглядел как "в наличии" на
-- сайте и в приложении (Delphinium modrý x10 доставлен, на складе всё ещё 10).
-- За всё время в журнале нет ни одной записи reason = 'sold'.
--
-- Решение: функция deduct_order_stock списывает заказ по партиям FIFO (самые
-- старые первыми) тем же правилом, что считает резерв (get_reserved_stock):
--   * новый формат Tilda (есть portion): quantity - уже штуки;
--   * старый формат / касса: quantity * order_unit_size;
--   * сет/букет: по составу (product_recipes).
-- Триггер вызывает её, когда заказ переходит в assembled / in_transit /
-- arriving / delivered. Если по заказу уже есть списание (собрали через
-- модалку) - ничего не делает, двойного списания нет. Берёт не больше, чем
-- есть в партиях, в минус не уходит.
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
      SELECT sticker_id, CASE WHEN in_pieces THEN qty ELSE qty * order_unit_size END AS x
      FROM matched WHERE category = 'ohapka'
      UNION ALL
      SELECT r.ingredient_sticker_id, r.quantity_needed * m.qty
      FROM matched m JOIN product_recipes r ON r.bouquet_sticker_id = m.sticker_id
      WHERE m.category IS DISTINCT FROM 'ohapka' AND r.ingredient_sticker_id IS NOT NULL
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
  END LOOP;

  RETURN v_total;
END;
$function$;

-- Только для триггера и ручного запуска из SQL-редактора.
REVOKE ALL ON FUNCTION public.deduct_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_order_stock(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_deduct_stock_on_dispatch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.deduct_order_stock(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_deduct_stock_on_dispatch ON tilda_orders;
CREATE TRIGGER trigger_deduct_stock_on_dispatch
AFTER UPDATE OF status ON tilda_orders
FOR EACH ROW
WHEN (NEW.status IN ('assembled', 'in_transit', 'arriving', 'delivered')
      AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.tg_deduct_stock_on_dispatch();

-- Разово: два заказа, уже доставленные 2026-10-09 без списания
-- (Delphinium modrý x10 и Dahlia caitlins + wizzard по упаковке).
-- Повторный запуск безопасен - при наличии списания функция ничего не делает.
SELECT public.deduct_order_stock(id)
FROM tilda_orders
WHERE order_id IN ('1122519953', '1496450754') AND status = 'delivered';
