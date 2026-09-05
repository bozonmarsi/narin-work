-- Флорист теперь может завести заказ "с кассы" прямо со своего экрана
-- (клиент в магазине, платит на месте) — раньше у роли warehouse было
-- право читать/обновлять заказы, но не создавать новые.
DROP POLICY IF EXISTS "warehouse_orders_insert" ON tilda_orders;
CREATE POLICY "warehouse_orders_insert" ON tilda_orders
  FOR INSERT WITH CHECK (
    is_warehouse() AND status = 'confirmed'
  );
