-- Имя и телефон контактного лица уже собираются при регистрации
-- (company_members.full_name/phone), но нигде не отображались обратно
-- клиенту в его же кабинете. Добавляем их в list_my_companies — это тот
-- же JOIN на company_members по email, что уже есть, просто выбираем
-- из него ещё пару полей.
DROP FUNCTION IF EXISTS public.list_my_companies(text);
CREATE OR REPLACE FUNCTION public.list_my_companies(p_email text)
RETURNS TABLE(
  id uuid, name text, ico text, dic text, is_vat_payer boolean, billing_address text,
  role text, balance numeric, member_full_name text, member_phone text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.ico, c.dic, c.is_vat_payer, c.billing_address,
         cm.role, c.balance, cm.full_name, cm.phone
  FROM companies c
  JOIN company_members cm ON cm.company_id = c.id
  WHERE lower(cm.email) = lower(btrim(p_email))
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_companies(text) TO anon, authenticated;
