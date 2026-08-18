-- Notify the customer by email whenever a manager replies in the support
-- chat. Mirrors the Telegram notify pattern (pg_net + a secret stashed in
-- Vault), but calls a Supabase Edge Function directly instead of the
-- Vercel app, since it needs to send via Brevo the same way auth-verify
-- does for OTP codes.

CREATE OR REPLACE FUNCTION notify_customer_reply()
RETURNS trigger AS $$
DECLARE
  v_secret text;
  v_email text;
BEGIN
  IF NEW.sender_type <> 'manager' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_reply_secret';

  IF v_secret IS NULL THEN
    RETURN NEW; -- secret not configured yet — stay silent
  END IF;

  SELECT email INTO v_email FROM support_conversations WHERE id = NEW.conversation_id;
  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://wqburlamuipxmenqsjnx.supabase.co/functions/v1/notify-reply',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('email', v_email, 'preview', left(NEW.body, 300))
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_customer_reply ON support_messages;
CREATE TRIGGER trigger_notify_customer_reply
AFTER INSERT ON support_messages
FOR EACH ROW
EXECUTE FUNCTION notify_customer_reply();
