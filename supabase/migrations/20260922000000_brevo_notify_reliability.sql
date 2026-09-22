-- Транзакционные письма/SMS клиентам (notify_brevo) молча терялись: pg_net
-- по умолчанию ждёт ответ от /api/brevo/notify только 5 сек, а Vercel-
-- функция при холодном старте иногда не укладывается — в net._http_response
-- живьём была найдена ровно такая ошибка (timed_out, ~5 сек). Без ретрая и
-- без алерта об этом никто не узнавал: письмо/SMS просто не уходило.
--
-- Фикс: (1) увеличенный таймаут, (2) лог каждого вызова + ретрай неудачных
-- через pg_cron (тот же паттерн, что уже используется для vanvliet-cron),
-- (3) алерт менеджерам в Telegram, если через 3 попытки так и не вышло.

CREATE TABLE IF NOT EXISTS brevo_notification_log (
  id bigserial PRIMARY KEY,
  payload jsonb NOT NULL,
  request_id bigint,
  retry_count int NOT NULL DEFAULT 0,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brevo_notification_log_unresolved_idx
  ON brevo_notification_log (request_id) WHERE resolved = false;

ALTER TABLE brevo_notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manager_all_brevo_notification_log" ON brevo_notification_log;
CREATE POLICY "manager_all_brevo_notification_log" ON brevo_notification_log FOR ALL USING (is_manager());

CREATE OR REPLACE FUNCTION notify_brevo(p_payload jsonb)
RETURNS void AS $$
DECLARE
  v_secret text;
  v_log_id bigint;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'telegram_webhook_secret';

  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO brevo_notification_log (payload) VALUES (p_payload) RETURNING id INTO v_log_id;

  v_request_id := net.http_post(
    url := 'https://narin-work.vercel.app/api/brevo/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := p_payload,
    timeout_milliseconds := 15000
  );

  UPDATE brevo_notification_log SET request_id = v_request_id WHERE id = v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Раз в 3 минуты: закрывает успешные, ретраит неудачные/потерянные
-- (до 3 раз), шлёт алерт менеджерам, если так и не получилось, и подчищает
-- старые записи, чтобы таблица не росла бесконечно.
CREATE OR REPLACE FUNCTION retry_failed_brevo_notifications()
RETURNS void AS $$
DECLARE
  v_secret text;
  r RECORD;
  v_new_request_id bigint;
BEGIN
  UPDATE brevo_notification_log l
  SET resolved = true
  FROM net._http_response resp
  WHERE resp.id = l.request_id AND l.resolved = false AND resp.status_code BETWEEN 200 AND 299;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'telegram_webhook_secret';

  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT l.id, l.payload, l.retry_count
    FROM brevo_notification_log l
    JOIN net._http_response resp ON resp.id = l.request_id
    WHERE l.resolved = false
      AND l.created_at > now() - interval '24 hours'
      AND (resp.status_code IS NULL OR resp.status_code NOT BETWEEN 200 AND 299)
  LOOP
    IF r.retry_count >= 3 THEN
      UPDATE brevo_notification_log SET resolved = true WHERE id = r.id;
      PERFORM notify_telegram_role('manager', '⚠️ Уведомление клиенту (' || COALESCE(r.payload->>'event', '?') || ', заказ #' || COALESCE(r.payload->>'order_id', '?') || ') не отправилось после 3 попыток — проверьте Brevo вручную.');
      CONTINUE;
    END IF;

    v_new_request_id := net.http_post(
      url := 'https://narin-work.vercel.app/api/brevo/notify',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
      body := r.payload,
      timeout_milliseconds := 15000
    );

    UPDATE brevo_notification_log
    SET request_id = v_new_request_id, retry_count = retry_count + 1, last_attempt_at = now()
    WHERE id = r.id;
  END LOOP;

  DELETE FROM brevo_notification_log WHERE resolved = true AND created_at < now() - interval '7 days';
  -- Предохранитель: если ответ от pg_net так и не появился вовсе (запись
  -- в net._http_response потерялась) — не висим в очереди вечно.
  UPDATE brevo_notification_log SET resolved = true WHERE resolved = false AND created_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule(
  'retry-brevo-notifications',
  '*/3 * * * *',
  $$SELECT retry_failed_brevo_notifications();$$
);
