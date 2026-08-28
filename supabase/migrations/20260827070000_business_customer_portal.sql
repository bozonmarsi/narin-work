-- Клиентский кабинет для бизнеса (/members/business) — email видит все
-- компании, к которым привязан (company_members), и их счета. Тот же
-- принцип "доступ по email, без пароля", что и у остальных
-- customer-facing RPC этой сессии — компромисс безопасности тот же:
-- зная чужой email, теоретически можно посмотреть, какие компании к
-- нему привязаны, но не более (счета видны только по факту членства).

-- Дополнительные данные о самом человеке (не о компании) — имя, телефон,
-- запасной email. Для перестраховки: если основной email потеряется или
-- письмо не дойдёт, есть чем связаться и на кого сослаться.
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS backup_email text;

CREATE OR REPLACE FUNCTION public.list_my_companies(p_email text)
RETURNS TABLE(id uuid, name text, ico text, dic text, is_vat_payer boolean, billing_address text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.ico, c.dic, c.is_vat_payer, c.billing_address, cm.role
  FROM companies c
  JOIN company_members cm ON cm.company_id = c.id
  WHERE lower(cm.email) = lower(btrim(p_email))
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_companies(text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.list_my_company_invoices(p_email text, p_company_id uuid)
RETURNS TABLE(id uuid, invoice_number text, period_start date, period_end date, total_amount numeric, status text, due_date date)
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
  SELECT i.id, i.invoice_number, i.period_start, i.period_end, i.total_amount, i.status, i.due_date
  FROM company_invoices i
  WHERE i.company_id = p_company_id
  ORDER BY i.period_start DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_company_invoices(text, uuid) TO anon, authenticated;


-- Проверка владения для скачивания PDF (используется новым серверным
-- роутом в NARIN WORK, не напрямую с Tilda-страницы) — без этого любой
-- мог бы скачать чужой счёт, зная только его id.
CREATE OR REPLACE FUNCTION public.can_access_invoice(p_email text, p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM company_invoices i
    JOIN company_members cm ON cm.company_id = i.company_id
    WHERE i.id = p_invoice_id AND lower(cm.email) = lower(btrim(p_email))
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_invoice(text, uuid) TO anon, authenticated;
