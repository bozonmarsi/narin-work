-- Письмо "Jak se vám kytice líbí?" через 3 дня после доставки: тут же
-- напоминание про воду/подрезку и просьба оставить отзыв (+10 баллов).
-- Раньше просьба об отзыве была только в письме "доставлено", то есть в
-- момент, когда букет ещё никто не рассмотрел (а у подарка он вообще у
-- другого человека): за две недели после перезапуска 15 доставок дали
-- один отзыв.
--
-- Что уходит и кому (send_review_requests, cron раз в день):
--   * заказ доставлен 3-7 дней назад (окно "до 7 дней" — чтобы в первый
--     запуск не высыпать письмо на весь старый архив);
--   * ещё нет отзыва и письмо по этому заказу не слали;
--   * не подарок (gift_links), не подписка, не заказ компании;
--   * не отписан от рассылок (newsletter_subscribers.status);
--   * не чаще одного письма на клиента за 3 дня (два заказа в один день).
-- Шаблон — "review_request" в web/src/app/api/brevo/notify/route.ts.

ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz;

-- Теги отзыва с новой формы (что понравилось / что улучшить). Белый список
-- на стороне БД, чтобы в таблицу нельзя было записать произвольный текст.
ALTER TABLE order_reviews ADD COLUMN IF NOT EXISTS tags text[];

-- Старую 4-аргументную версию убираем, иначе PostgREST не сможет выбрать
-- между двумя перегрузками. Старые вызовы (без p_tags) продолжают
-- работать — для них p_tags = NULL.
DROP FUNCTION IF EXISTS public.submit_order_review(text, text, int, text);

CREATE OR REPLACE FUNCTION public.submit_order_review(
  p_email text, p_order_id text, p_rating int, p_comment text, p_tags text[] DEFAULT NULL
)
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
  v_allowed constant text[] := ARRAY['freshness', 'look', 'packaging', 'delivery', 'communication', 'price'];
  v_tags text[];
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

  SELECT array_agg(DISTINCT t) INTO v_tags FROM unnest(p_tags) AS t WHERE t = ANY (v_allowed);

  BEGIN
    INSERT INTO order_reviews (order_id, customer_email, rating, comment, points_awarded, tags)
    VALUES (btrim(p_order_id), v_email, p_rating, v_comment, v_reward, v_tags);
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

GRANT EXECUTE ON FUNCTION public.submit_order_review(text, text, int, text, text[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_review_requests()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_token uuid;
  v_count integer := 0;
BEGIN
  FOR o IN
    SELECT t.*, COALESCE(h.delivered_at, t.delivery_date) AS delivered_at
    FROM tilda_orders t
    LEFT JOIN LATERAL (
      SELECT max(s.changed_at) AS delivered_at
      FROM order_status_history s
      WHERE s.order_id = t.id AND s.status = 'delivered'
    ) h ON true
    WHERE t.status = 'delivered'
      AND t.review_request_sent_at IS NULL
      AND t.subscription_id IS NULL
      AND t.company_id IS NULL
      AND COALESCE(t.customer_email, '') LIKE '%@%'
      AND COALESCE(h.delivered_at, t.delivery_date) BETWEEN now() - interval '7 days' AND now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM gift_links g WHERE g.order_id = t.order_id)
      AND NOT EXISTS (SELECT 1 FROM order_reviews r WHERE r.order_id = t.order_id)
      AND NOT EXISTS (
        SELECT 1 FROM newsletter_subscribers ns
        WHERE lower(ns.email) = lower(t.customer_email) AND ns.status = 'unsubscribed'
      )
    ORDER BY COALESCE(h.delivered_at, t.delivery_date)
    LIMIT 50
  LOOP
    -- Запрос выше считается один раз, поэтому "не чаще раза в 3 дня на клиента"
    -- проверяем здесь, уже с учётом писем, отправленных в этом же запуске.
    IF EXISTS (
      SELECT 1 FROM tilda_orders n
      WHERE lower(n.customer_email) = lower(o.customer_email)
        AND n.id <> o.id
        AND n.review_request_sent_at > now() - interval '3 days'
    ) THEN
      CONTINUE;
    END IF;

    -- Сначала отметка, потом отправка: сбойный ретрай не должен дать два письма.
    UPDATE tilda_orders SET review_request_sent_at = now() WHERE id = o.id;

    SELECT ns.unsubscribe_token INTO v_token FROM newsletter_subscribers ns WHERE lower(ns.email) = lower(o.customer_email);

    PERFORM notify_brevo(jsonb_build_object(
      'event', 'review_request',
      'order_id', COALESCE(o.order_id, o.id::text),
      'email', o.customer_email,
      'products_text', o.products_text,
      'order_total', o.order_total,
      'unsub_token', v_token
    ));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- 08:00 UTC = 9:00 по Праге зимой (10:00 летом). pg_cron работает в UTC.
SELECT cron.schedule('review-requests-daily', '0 8 * * *', $$SELECT public.send_review_requests()$$);

-- Страница отзыва показывает, ЧТО именно за заказ: дата доставки и состав с
-- фото. Раньше get_order_for_review отдавала только текст состава и сумму.
-- Фото берём из product_stickers по названию (названия там хранятся с
-- HTML-сущностями, поэтому сравниваем нормализованные ключи: без сущностей,
-- без не-латинских символов). Совпадает ~98% строк заказов; без совпадения
-- image пустой, страница показывает строку без картинки.
-- Старые поля остались на своих местах, новые добавлены в конец.
DROP FUNCTION IF EXISTS public.get_order_for_review(text);

CREATE OR REPLACE FUNCTION public.get_order_for_review(p_order_id text)
RETURNS TABLE(order_id text, products_text text, order_total numeric, already_reviewed boolean, delivery_date date, items jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.order_id,
    o.products_text,
    o.order_total,
    (r.id IS NOT NULL),
    (o.delivery_date AT TIME ZONE 'Europe/Prague')::date,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', it.name, 'qty', it.qty, 'image', st.image_url) ORDER BY it.ord)
      FROM (
        SELECT
          btrim(regexp_replace(l.line, '\s*[xX×]\s*\d+\s*$', '')) AS name,
          NULLIF(substring(l.line from '[xX×]\s*(\d+)\s*$'), '')::int AS qty,
          regexp_replace(regexp_replace(lower(btrim(regexp_replace(l.line, '\s*[xX×]\s*\d+\s*$', ''))), '&#?[a-z0-9]+;', '', 'gi'), '[^a-z0-9]', '', 'g') AS k,
          l.ord
        FROM regexp_split_to_table(coalesce(o.products_text, ''), E'\n') WITH ORDINALITY AS l(line, ord)
        WHERE btrim(l.line) <> ''
      ) it
      LEFT JOIN LATERAL (
        SELECT s.image_url FROM product_stickers s
        WHERE s.image_url IS NOT NULL
          AND regexp_replace(regexp_replace(lower(s.product_name), '&#?[a-z0-9]+;', '', 'gi'), '[^a-z0-9]', '', 'g') = it.k
        LIMIT 1
      ) st ON true
    ), '[]'::jsonb)
  FROM tilda_orders o
  LEFT JOIN order_reviews r ON r.order_id = o.order_id
  WHERE o.order_id = btrim(p_order_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_order_for_review(text) TO anon, authenticated;
