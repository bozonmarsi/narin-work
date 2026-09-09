-- Флористу на кассе нужно видеть не только почту и баллы, но и имя,
-- телефон, сколько раз клиент уже покупал и когда последний раз — чтобы
-- было понятно, с кем разговариваешь, не листая "Клиентов" отдельно.
-- Возвращаемый тип поменялся, поэтому пересоздаём функцию целиком.
DROP FUNCTION IF EXISTS lookup_customer_by_code(text);

CREATE FUNCTION lookup_customer_by_code(p_code text)
RETURNS TABLE (
  email text,
  balance bigint,
  ma_id text,
  customer_name text,
  customer_phone text,
  orders_count bigint,
  last_order_at timestamptz,
  total_earned bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    tp.email,
    tp.balance,
    tp.ma_id,
    o.customer_name,
    o.customer_phone,
    (SELECT count(*) FROM tilda_orders WHERE customer_email = tp.email),
    (SELECT max(created_at) FROM tilda_orders WHERE customer_email = tp.email),
    COALESCE((SELECT sum(amount) FROM points_transactions WHERE user_email = tp.email AND amount > 0), 0)
  FROM "Tilda points" tp
  LEFT JOIN LATERAL (
    SELECT customer_name, customer_phone
    FROM tilda_orders
    WHERE customer_email = tp.email
    ORDER BY created_at DESC
    LIMIT 1
  ) o ON true
  WHERE (is_manager() OR is_warehouse())
    AND (
      upper(tp.ma_id) = upper(p_code)
      OR upper(replace(tp.id::text, '-', '')) LIKE upper(p_code) || '%'
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION lookup_customer_by_code(text) TO authenticated;
