-- Уведомления в Telegram. Триггер сам решает, кому и что писать, и дёргает
-- наш сервер (pg_net = асинхронный HTTP-запрос из базы) — сам текст
-- сообщений и отправка в Telegram API живут в коде (/api/telegram/notify),
-- триггер только собирает "кому + что" и передаёт дальше.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_telegram(p_chat_id bigint, p_message text)
RETURNS void AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_chat_id IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'telegram_webhook_secret';

  IF v_secret IS NULL THEN
    RETURN; -- секрет ещё не настроен — молча ничего не отправляем
  END IF;

  PERFORM net.http_post(
    url := 'https://narin-work.vercel.app/api/telegram/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('chat_id', p_chat_id, 'text', p_message)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_telegram_role(p_role text, p_message text)
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT telegram_chat_id FROM users WHERE role = p_role AND telegram_chat_id IS NOT NULL LOOP
    PERFORM notify_telegram(r.telegram_chat_id, p_message);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Новый заказ поступил
CREATE OR REPLACE FUNCTION tg_notify_new_order()
RETURNS trigger AS $$
BEGIN
  PERFORM notify_telegram_role('manager', '🆕 Новый заказ #' || COALESCE(NEW.order_id, NEW.id::text) || ' поступил');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_tg_notify_new_order ON tilda_orders;
CREATE TRIGGER trigger_tg_notify_new_order
AFTER INSERT ON tilda_orders
FOR EACH ROW
EXECUTE FUNCTION tg_notify_new_order();

-- Все события на обновление заказа
CREATE OR REPLACE FUNCTION tg_notify_order_update()
RETURNS trigger AS $$
DECLARE
  v_courier_name text;
BEGIN
  -- Оплата определилась
  IF NEW.payment_status IS NOT NULL AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    PERFORM notify_telegram_role('manager', '💳 Заказ #' || COALESCE(NEW.order_id, NEW.id::text) || ' — оплата: ' || NEW.payment_status);
  END IF;

  -- Заказ подтверждён и пока без курьера → в пул
  IF NEW.status = 'confirmed' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.assigned_courier_id IS NULL THEN
    PERFORM notify_telegram_role('manager', '🆕 Заказ #' || COALESCE(NEW.order_id, NEW.id::text) || ' подтверждён, в пуле, ждёт курьера');
    PERFORM notify_telegram_role('courier', '📦 Новый заказ в пуле: #' || COALESCE(NEW.order_id, NEW.id::text) || ', ' || COALESCE(NEW.address, '') || ', ' || COALESCE(NEW.delivery_slot, ''));
  END IF;

  -- Курьера назначили (сам взял или менеджер назначил — не различаем, событие одно)
  IF NEW.assigned_courier_id IS NOT NULL AND NEW.assigned_courier_id IS DISTINCT FROM OLD.assigned_courier_id THEN
    SELECT full_name INTO v_courier_name FROM users WHERE id = NEW.assigned_courier_id;
    PERFORM notify_telegram_role('manager', '✅ Заказ #' || COALESCE(NEW.order_id, NEW.id::text) || ' взял курьер ' || COALESCE(v_courier_name, '—'));
    PERFORM notify_telegram(
      (SELECT telegram_chat_id FROM users WHERE id = NEW.assigned_courier_id),
      '📦 Вам назначен заказ #' || COALESCE(NEW.order_id, NEW.id::text) || ', ' || COALESCE(NEW.address, '') || ', ' || COALESCE(NEW.delivery_slot, '')
    );
  END IF;

  -- Прогресс доставки
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'assembled' THEN
      PERFORM notify_telegram_role('manager', '🌸 Заказ #' || COALESCE(NEW.order_id, NEW.id::text) || ' собран');
    ELSIF NEW.status = 'in_transit' THEN
      PERFORM notify_telegram_role('manager', '🚗 Курьер выехал с заказом #' || COALESCE(NEW.order_id, NEW.id::text));
    ELSIF NEW.status = 'delivered' THEN
      PERFORM notify_telegram_role('manager', '📬 Заказ #' || COALESCE(NEW.order_id, NEW.id::text) || ' доставлен');
    ELSIF NEW.status = 'cancelled' AND OLD.assigned_courier_id IS NOT NULL THEN
      PERFORM notify_telegram(
        (SELECT telegram_chat_id FROM users WHERE id = OLD.assigned_courier_id),
        '❌ Заказ #' || COALESCE(NEW.order_id, NEW.id::text) || ' отменён менеджером'
      );
    END IF;
  END IF;

  -- Проблема у курьера
  IF NEW.problem_reported IS TRUE AND NEW.problem_reported IS DISTINCT FROM OLD.problem_reported THEN
    PERFORM notify_telegram_role('manager', '⚠️ Проблема по заказу #' || COALESCE(NEW.order_id, NEW.id::text) || ': ' || COALESCE(NEW.problem_comment, 'без комментария'));
  END IF;

  -- Запрос переноса
  IF NEW.transfer_requested IS TRUE AND NEW.transfer_requested IS DISTINCT FROM OLD.transfer_requested THEN
    PERFORM notify_telegram_role('manager', '📅 Запрос переноса заказа #' || COALESCE(NEW.order_id, NEW.id::text) || ' на ' || COALESCE(NEW.transfer_proposed_date::text, 'не указано') || ': ' || COALESCE(NEW.transfer_reason, 'без причины'));
  END IF;

  -- Комментарий менеджера курьеру
  IF NEW.manager_comment IS NOT NULL AND NEW.manager_comment IS DISTINCT FROM OLD.manager_comment AND NEW.assigned_courier_id IS NOT NULL THEN
    PERFORM notify_telegram(
      (SELECT telegram_chat_id FROM users WHERE id = NEW.assigned_courier_id),
      '💬 Комментарий по заказу #' || COALESCE(NEW.order_id, NEW.id::text) || ': ' || NEW.manager_comment
    );
  END IF;

  -- Изменились детали уже построенного маршрута
  IF NEW.assigned_courier_id IS NOT NULL AND OLD.route_sequence IS NOT NULL AND (
    NEW.address IS DISTINCT FROM OLD.address
    OR NEW.delivery_date IS DISTINCT FROM OLD.delivery_date
    OR NEW.delivery_slot IS DISTINCT FROM OLD.delivery_slot
    OR NEW.delivery_window_start IS DISTINCT FROM OLD.delivery_window_start
    OR NEW.delivery_window_end IS DISTINCT FROM OLD.delivery_window_end
  ) THEN
    PERFORM notify_telegram(
      (SELECT telegram_chat_id FROM users WHERE id = NEW.assigned_courier_id),
      '⚠️ Изменились детали заказа #' || COALESCE(NEW.order_id, NEW.id::text) || ' — маршрут нужно пересчитать'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_tg_notify_order_update ON tilda_orders;
CREATE TRIGGER trigger_tg_notify_order_update
AFTER UPDATE ON tilda_orders
FOR EACH ROW
EXECUTE FUNCTION tg_notify_order_update();

-- Вызывается вебхуком, когда сотрудник пишет боту /start <код> — без
-- сервисного ключа, только по совпадению одноразового кода (тот же подход,
-- что и остальные привилегированные операции в проекте).
CREATE OR REPLACE FUNCTION link_telegram_account(p_code text, p_chat_id bigint)
RETURNS boolean AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE users
  SET telegram_chat_id = p_chat_id
  WHERE telegram_link_code = p_code;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION link_telegram_account(text, bigint) TO anon, authenticated;
