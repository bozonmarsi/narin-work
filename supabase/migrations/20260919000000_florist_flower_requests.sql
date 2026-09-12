-- Пожелания флориста: она лучше знает, какие цветы нужны для её
-- букетов на конкретную дату, и должна мочь попросить их напрямую, а
-- не через менеджера "на словах". Менеджер видит эти пожелания на
-- вкладке "Заказы цветов" вместе с автоматически посчитанным дефицитом
-- по заказам (тот отдельно НЕ хранится — считается на лету из
-- tilda_orders + product_recipes + остатков, чтобы не протухал, как
-- протухали алиасы Van Vliet, см. предыдущие миграции).
CREATE TABLE IF NOT EXISTS florist_flower_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_sticker_id uuid NOT NULL REFERENCES product_stickers(id) ON DELETE CASCADE,
  needed_date date NOT NULL,
  quantity numeric NOT NULL,
  note text,
  requested_by uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS florist_flower_requests_date_idx ON florist_flower_requests (needed_date, status);

ALTER TABLE florist_flower_requests ENABLE ROW LEVEL SECURITY;

-- Менеджер видит и делает всё (в т.ч. отмечает "заказано"/"отклонено").
DROP POLICY IF EXISTS "manager_all_florist_flower_requests" ON florist_flower_requests;
CREATE POLICY "manager_all_florist_flower_requests" ON florist_flower_requests
  FOR ALL USING (is_manager()) WITH CHECK (is_manager());

-- Склад (флорист) видит весь список пожеланий — это общий список для
-- команды, не только свой.
DROP POLICY IF EXISTS "warehouse_read_florist_flower_requests" ON florist_flower_requests;
CREATE POLICY "warehouse_read_florist_flower_requests" ON florist_flower_requests
  FOR SELECT USING (is_warehouse());

-- Но добавлять/менять/удалять склад может только свои собственные
-- пожелания — не чужие.
DROP POLICY IF EXISTS "warehouse_own_florist_flower_requests" ON florist_flower_requests;
CREATE POLICY "warehouse_own_florist_flower_requests" ON florist_flower_requests
  FOR ALL USING (is_warehouse() AND requested_by = auth.uid())
  WITH CHECK (is_warehouse() AND requested_by = auth.uid());

-- Список должен обновляться сам на обоих экранах (менеджер/склад), без
-- ручного refresh — как и остальные вкладки склада.
ALTER PUBLICATION supabase_realtime ADD TABLE florist_flower_requests;
