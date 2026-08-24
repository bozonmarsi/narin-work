-- welcome_points_trigger() (первый заказ) и claim_welcome_points() RPC
-- (регистрация) теперь оба могут начислить приветственные баллы одному и
-- тому же клиенту — раньше это делал только первый. Без этой правки
-- сценарий "сначала регистрация (RPC), потом первый заказ (триггер)"
-- ломал создание заказа: триггер пытался вставить вторую welcome-запись,
-- упирался в points_transactions_one_welcome_per_email и необработанная
-- ошибка откатывала ВСЮ вставку заказа.
--
-- Добавляем ту же проверку "ещё не начисляли" (по email, без учёта
-- регистра), что уже есть в claim_welcome_points — теперь оба механизма
-- безопасно сосуществуют: кто сработал первым, тот и начислил, второй
-- просто ничего не делает вместо падения.
CREATE OR REPLACE FUNCTION public.welcome_points_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tilda_orders
    WHERE customer_email = NEW.customer_email
    AND order_id <> NEW.order_id
  ) AND NOT EXISTS (
    SELECT 1 FROM points_transactions
    WHERE lower(user_email) = lower(NEW.customer_email) AND type = 'welcome'
  ) THEN
    INSERT INTO points_transactions (user_email, amount, order_id, type)
    VALUES (NEW.customer_email, 150, NEW.order_id, 'welcome');
  END IF;

  RETURN NEW;
END;
$function$;
