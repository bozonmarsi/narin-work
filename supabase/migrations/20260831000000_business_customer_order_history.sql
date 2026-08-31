-- История заказов компании для клиентского кабинета (/members/business).
-- Отличается от обычной "истории заказов" в личном профиле клиента тем,
-- что показывает ВСЕ заказы фирмы (по company_id), а не только заказы,
-- сделанные с конкретного email — если у компании несколько сотрудников
-- заказывают, каждый видит общую историю, а не только свою часть.
CREATE OR REPLACE FUNCTION public.list_my_company_orders(p_email text, p_company_id uuid)
RETURNS TABLE(
  order_id text, created_at timestamptz, delivery_date date,
  order_total numeric, status text, products_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id AND lower(email) = lower(btrim(p_email))
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.order_id, o.created_at, o.delivery_date, o.order_total, o.status, o.products_text
  FROM tilda_orders o
  WHERE o.company_id = p_company_id
  ORDER BY o.created_at DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_company_orders(text, uuid) TO anon, authenticated;
