-- PDF faktury potrebuje datum vystaveni a datum uhrady (zaplacena faktura se vykresli jako
-- "UHRAZENO" bez platebnich udaju). Pridavame issued_at a paid_at do vysledku funkce.
-- Zmena sloupcu vyzaduje DROP + CREATE.
DROP FUNCTION IF EXISTS public.get_invoice_with_company(text, uuid);
CREATE OR REPLACE FUNCTION public.get_invoice_with_company(p_email text, p_invoice_id uuid)
RETURNS TABLE(
  invoice_id uuid, invoice_number text, period_start date, period_end date,
  total_amount numeric, due_date date, status text,
  company_name text, company_ico text, company_dic text, company_billing_address text,
  issued_at timestamptz, paid_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.invoice_number, i.period_start, i.period_end, i.total_amount, i.due_date, i.status,
         c.name, c.ico, c.dic, c.billing_address, i.issued_at, i.paid_at
  FROM company_invoices i
  JOIN companies c ON c.id = i.company_id
  JOIN company_members cm ON cm.company_id = i.company_id
  WHERE i.id = p_invoice_id AND lower(cm.email) = lower(btrim(p_email));
$$;
GRANT EXECUTE ON FUNCTION public.get_invoice_with_company(text, uuid) TO anon, authenticated;
