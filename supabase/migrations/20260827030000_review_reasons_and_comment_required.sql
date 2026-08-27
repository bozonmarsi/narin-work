-- Правки по итогам первого живого теста страницы отзыва:
-- 1) submit_order_review возвращал одно и то же "false" на любую причину
--    отказа (невалидные данные, чужой заказ, повторная отправка) — со
--    страницы это выглядело как "не работает" без объяснения. Теперь
--    отдаёт reason, фронтенд показывает разный текст под каждую причину.
-- 2) Баллы теперь не начисляются за пустой/однословный отзыв без всякого
--    содержания — комментарий обязателен (минимум 2 символа после
--    обрезки пробелов), иначе просто "оценка со звёздами" без единого
--    слова не считается за 10 баллов.
CREATE OR REPLACE FUNCTION public.submit_order_review(p_email text, p_order_id text, p_rating int, p_comment text)
RETURNS TABLE(ok boolean, points_awarded int, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_order_email text;
  v_comment text := NULLIF(btrim(p_comment), '');
  v_reward constant int := 10;
BEGIN
  IF v_email = '' OR p_order_id IS NULL OR btrim(p_order_id) = '' OR p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN QUERY SELECT false, 0, 'invalid';
    RETURN;
  END IF;

  IF v_comment IS NULL OR length(v_comment) < 2 THEN
    RETURN QUERY SELECT false, 0, 'comment_required';
    RETURN;
  END IF;

  -- Только сам заказчик может оставить отзыв на свой заказ — иначе
  -- зная чужой номер заказа можно было бы накрутить кому-то отзывы.
  SELECT lower(customer_email) INTO v_order_email FROM tilda_orders WHERE order_id = btrim(p_order_id);
  IF v_order_email IS NULL OR v_order_email IS DISTINCT FROM v_email THEN
    RETURN QUERY SELECT false, 0, 'not_owner';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO order_reviews (order_id, customer_email, rating, comment, points_awarded)
    VALUES (btrim(p_order_id), v_email, p_rating, v_comment, v_reward);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT false, 0, 'already_reviewed';
    RETURN;
  END;

  UPDATE "Tilda points" SET balance = balance + v_reward WHERE lower(email) = v_email;
  INSERT INTO points_transactions (user_email, amount, type, order_id, description)
  VALUES (v_email, v_reward, 'review_bonus', btrim(p_order_id), 'Bonus za recenzi objednávky');

  INSERT INTO customer_activity_log (customer_email, action, details)
  VALUES (v_email, 'review_submitted', p_rating || '★ · objednávka č. ' || btrim(p_order_id));

  RETURN QUERY SELECT true, v_reward, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_order_review(text, text, int, text) TO anon, authenticated;
