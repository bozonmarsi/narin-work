-- users.role — это enum user_role, а не text; сравнение "role = p_role"
-- падало с "operator does not exist: user_role = text" и откатывало ВСЮ
-- транзакцию (включая сам статус заказа), не только уведомление.
CREATE OR REPLACE FUNCTION notify_telegram_role(p_role text, p_message text)
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT telegram_chat_id FROM users WHERE role = p_role::user_role AND telegram_chat_id IS NOT NULL LOOP
    PERFORM notify_telegram(r.telegram_chat_id, p_message);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
