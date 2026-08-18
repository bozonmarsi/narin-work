-- Notify managers in Telegram whenever a customer sends a new support chat
-- message, reusing the existing notify_telegram_role() helper from the
-- order-notification triggers.

CREATE OR REPLACE FUNCTION tg_notify_new_support_message()
RETURNS trigger AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.sender_type <> 'customer' THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM support_conversations WHERE id = NEW.conversation_id;

  PERFORM notify_telegram_role('manager', '💬 Nová zpráva v chatu od ' || COALESCE(v_email, '—') || ': ' || left(NEW.body, 200));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_tg_notify_new_support_message ON support_messages;
CREATE TRIGGER trigger_tg_notify_new_support_message
AFTER INSERT ON support_messages
FOR EACH ROW
EXECUTE FUNCTION tg_notify_new_support_message();
