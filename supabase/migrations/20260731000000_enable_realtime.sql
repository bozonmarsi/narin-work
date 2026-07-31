-- Включаем Realtime для таблиц, которые приложение должно обновлять сама
-- собой без ручной перезагрузки страницы. DO-блок, чтобы повторный запуск
-- миграции не падал с ошибкой "already member of publication".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tilda_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tilda_orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_status_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_status_history;
  END IF;
END $$;
