-- Часть 1: письма клиенту получают больше контекста (имя получателя,
-- состав букета, сумма, дата/время доставки) — раньше триггер передавал
-- в route.ts только email и номер заказа, поэтому в письме нельзя было
-- показать ничего, кроме статуса.
CREATE OR REPLACE FUNCTION tg_notify_customer_brevo()
RETURNS trigger AS $$
DECLARE
  v_is_pickup boolean;
  v_pickup_address text;
  v_common jsonb;
BEGIN
  v_is_pickup := COALESCE(NEW.delivery_type, '') NOT ILIKE '%kurýrem%';

  v_common := jsonb_build_object(
    'order_id', COALESCE(NEW.order_id, NEW.id::text),
    'email', NEW.customer_email,
    'recipient_name', NEW.recipient_name,
    'products_text', NEW.products_text,
    'order_total', NEW.order_total,
    'delivery_date', NEW.delivery_date,
    'delivery_time', COALESCE(NEW.delivery_slot, NEW.delivery_time_raw)
  );

  IF NEW.status = 'confirmed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(v_common || jsonb_build_object(
      'event', CASE WHEN NEW.payment_method = 'stripe' THEN 'order_confirmed_stripe' ELSE 'order_confirmed_cod' END
    ));
  END IF;

  IF NEW.status = 'assembled' AND NEW.status IS DISTINCT FROM OLD.status AND v_is_pickup THEN
    SELECT address INTO v_pickup_address FROM warehouse_location WHERE id = true;
    PERFORM notify_brevo(v_common || jsonb_build_object(
      'event', 'pickup_ready',
      'pickup_address', v_pickup_address
    ));
  END IF;

  IF NEW.status = 'in_transit' AND NEW.status IS DISTINCT FROM OLD.status AND NOT v_is_pickup THEN
    PERFORM notify_brevo(v_common || jsonb_build_object('event', 'courier_out'));
  END IF;

  IF NEW.status = 'delivered' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(v_common || jsonb_build_object('event', 'delivered'));
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


-- Часть 2: отзывы на заказ + бонус в баллах за оставленный отзыв.
-- Тот же паттерн, что и у остальных customer-facing RPC этой сессии:
-- доступ по email (без пароля), идемпотентность через уникальный индекс
-- (один отзыв на заказ — уникальность order_id и защищает от повторной
-- накрутки баллов при повторной отправке формы).
CREATE TABLE IF NOT EXISTS order_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  customer_email text NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  points_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_reviews_email_idx ON order_reviews (lower(customer_email));

ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manager_all_order_reviews" ON order_reviews;
CREATE POLICY "manager_all_order_reviews" ON order_reviews FOR ALL USING (is_manager());

CREATE OR REPLACE FUNCTION public.get_order_for_review(p_order_id text)
RETURNS TABLE(order_id text, products_text text, order_total numeric, already_reviewed boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.order_id, o.products_text, o.order_total, (r.id IS NOT NULL)
  FROM tilda_orders o
  LEFT JOIN order_reviews r ON r.order_id = o.order_id
  WHERE o.order_id = btrim(p_order_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_order_for_review(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_order_review(p_email text, p_order_id text, p_rating int, p_comment text)
RETURNS TABLE(ok boolean, points_awarded int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_order_email text;
  v_reward constant int := 10;
BEGIN
  IF v_email = '' OR p_order_id IS NULL OR btrim(p_order_id) = '' OR p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  -- Только сам заказчик может оставить отзыв на свой заказ — иначе
  -- зная чужой номер заказа можно было бы накрутить кому-то отзывы.
  SELECT lower(customer_email) INTO v_order_email FROM tilda_orders WHERE order_id = btrim(p_order_id);
  IF v_order_email IS NULL OR v_order_email IS DISTINCT FROM v_email THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO order_reviews (order_id, customer_email, rating, comment, points_awarded)
    VALUES (btrim(p_order_id), v_email, p_rating, NULLIF(btrim(p_comment), ''), v_reward);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END;

  UPDATE "Tilda points" SET balance = balance + v_reward WHERE lower(email) = v_email;
  INSERT INTO points_transactions (user_email, amount, type, order_id, description)
  VALUES (v_email, v_reward, 'review_bonus', btrim(p_order_id), 'Bonus za recenzi objednávky');

  INSERT INTO customer_activity_log (customer_email, action, details)
  VALUES (v_email, 'review_submitted', p_rating || '★ · objednávka č. ' || btrim(p_order_id));

  RETURN QUERY SELECT true, v_reward;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_order_review(text, text, int, text) TO anon, authenticated;
