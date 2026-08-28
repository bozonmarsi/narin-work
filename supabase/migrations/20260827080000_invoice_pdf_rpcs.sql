-- Данные для генерации PDF-счёта клиенту (используются новым серверным
-- роутом в NARIN WORK, вызывается anon-ключом, без сессии менеджера —
-- проверка владения по email внутри самих функций, как и весь
-- остальной customer-facing слой этой сессии).

CREATE OR REPLACE FUNCTION public.get_invoice_with_company(p_email text, p_invoice_id uuid)
RETURNS TABLE(
  invoice_id uuid, invoice_number text, period_start date, period_end date,
  total_amount numeric, due_date date, status text,
  company_name text, company_ico text, company_dic text, company_billing_address text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.invoice_number, i.period_start, i.period_end, i.total_amount, i.due_date, i.status,
         c.name, c.ico, c.dic, c.billing_address
  FROM company_invoices i
  JOIN companies c ON c.id = i.company_id
  JOIN company_members cm ON cm.company_id = i.company_id
  WHERE i.id = p_invoice_id AND lower(cm.email) = lower(btrim(p_email));
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_with_company(text, uuid) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.list_invoice_period_orders(p_email text, p_invoice_id uuid)
RETURNS TABLE(order_id text, delivery_date date, order_total numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.order_id, o.delivery_date, o.order_total
  FROM tilda_orders o
  JOIN company_invoices i ON i.company_id = o.company_id
  JOIN company_members cm ON cm.company_id = i.company_id
  WHERE i.id = p_invoice_id
    AND lower(cm.email) = lower(btrim(p_email))
    AND o.status = 'delivered'
    AND o.delivery_date BETWEEN i.period_start AND i.period_end
  ORDER BY o.delivery_date;
$$;

GRANT EXECUTE ON FUNCTION public.list_invoice_period_orders(text, uuid) TO anon, authenticated;
