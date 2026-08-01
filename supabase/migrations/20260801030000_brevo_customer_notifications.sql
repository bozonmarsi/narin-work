-- Клиентские email/SMS через Brevo — та же схема, что и Telegram-триггеры
-- для сотрудников: триггер собирает "кому + что" и дёргает наш сервер
-- (pg_net), сам текст письма живёт в коде (/api/brevo/notify).
CREATE OR REPLACE FUNCTION notify_brevo(p_payload jsonb)
RETURNS void AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'telegram_webhook_secret'; -- тот же секрет, что и для Telegram-эндпоинта

  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://narin-work.vercel.app/api/brevo/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := p_payload
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION tg_notify_customer_brevo()
RETURNS trigger AS $$
DECLARE
  v_is_pickup boolean;
  v_pickup_address text;
BEGIN
  -- Курьерская доставка всегда содержит "kurýrem" в этом поле ('Doručení
  -- kurýrem + servisní poplatek = 239'), самовывоз — нет ('Servisní
  -- poplatek = 80').
  v_is_pickup := COALESCE(NEW.delivery_type, '') NOT ILIKE '%kurýrem%';

  IF NEW.status = 'confirmed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(jsonb_build_object(
      'event', CASE WHEN NEW.payment_method = 'stripe' THEN 'order_confirmed_stripe' ELSE 'order_confirmed_cod' END,
      'order_id', COALESCE(NEW.order_id, NEW.id::text),
      'email', NEW.customer_email
    ));
  END IF;

  IF NEW.status = 'assembled' AND NEW.status IS DISTINCT FROM OLD.status AND v_is_pickup THEN
    SELECT address INTO v_pickup_address FROM warehouse_location WHERE id = true;
    PERFORM notify_brevo(jsonb_build_object(
      'event', 'pickup_ready',
      'order_id', COALESCE(NEW.order_id, NEW.id::text),
      'email', NEW.customer_email,
      'pickup_address', v_pickup_address
    ));
  END IF;

  IF NEW.status = 'in_transit' AND NEW.status IS DISTINCT FROM OLD.status AND NOT v_is_pickup THEN
    PERFORM notify_brevo(jsonb_build_object(
      'event', 'courier_out',
      'order_id', COALESCE(NEW.order_id, NEW.id::text),
      'email', NEW.customer_email
    ));
  END IF;

  IF NEW.status = 'delivered' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(jsonb_build_object(
      'event', 'delivered',
      'order_id', COALESCE(NEW.order_id, NEW.id::text),
      'email', NEW.customer_email
    ));
  END IF;

  IF NEW.status = 'arriving' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(jsonb_build_object(
      'event', 'arriving_sms',
      'order_id', COALESCE(NEW.order_id, NEW.id::text),
      'phone', NEW.recipient_phone
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_tg_notify_customer_brevo ON tilda_orders;
CREATE TRIGGER trigger_tg_notify_customer_brevo
AFTER UPDATE ON tilda_orders
FOR EACH ROW
EXECUTE FUNCTION tg_notify_customer_brevo();
