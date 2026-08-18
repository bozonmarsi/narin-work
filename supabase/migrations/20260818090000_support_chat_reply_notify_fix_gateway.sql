-- The previous version sent only our custom secret as the Authorization
-- header, which Supabase's own edge function gateway rejects outright
-- (UNAUTHORIZED_INVALID_JWT_FORMAT) before our function code ever runs —
-- it expects a real Supabase key there. Send the public anon/publishable
-- key to satisfy the gateway, and move our own secret to a custom header
-- that the function checks itself.

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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_ORMmBYvVjH6i2GanWa2JyA_mWm3fTCZ',
      'X-Notify-Secret', v_secret
    ),
    body := jsonb_build_object('email', v_email, 'preview', left(NEW.body, 300))
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
