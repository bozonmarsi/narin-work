-- Общий журнал действий менеджеров над карточкой клиента (не заказов —
-- для тех уже есть order_status_history/"Логи"). Нужен, чтобы видеть,
-- кто и когда добавил/изменил день рождения или важную дату, начислил
-- баллы, пополнил депозит и т.д. — раньше не было видно даже КТО из
-- менеджеров это сделал, только сам факт (points_transactions без
-- ссылки на менеджера).
CREATE TABLE IF NOT EXISTS customer_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.users(id),
  customer_email text NOT NULL,
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_activity_log_created_at_idx
  ON customer_activity_log (created_at DESC);

ALTER TABLE customer_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_customer_activity_log" ON customer_activity_log;
CREATE POLICY "manager_all_customer_activity_log" ON customer_activity_log
  FOR ALL USING (is_manager());

-- Без этого страница "Логи" не обновится сама при новой записи — так же,
-- как это уже настроено для order_status_history.
ALTER PUBLICATION supabase_realtime ADD TABLE customer_activity_log;
