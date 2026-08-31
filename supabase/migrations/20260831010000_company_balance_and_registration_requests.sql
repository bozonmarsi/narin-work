-- Корпоративный баланс (лицевой счёт): компания пополняет переводом,
-- менеджер вручную вносит операцию в NARIN WORK — сумма и история сразу
-- видны в клиентском кабинете. Аналог депозита у обычных клиентов
-- (deposit_transactions), но привязан к company_id, а не к email —
-- баланс общий на всю фирму, независимо от того, кто из сотрудников
-- сейчас смотрит кабинет.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS company_balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL,
  description text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_balance_transactions_company_idx
  ON company_balance_transactions (company_id, created_at DESC);

ALTER TABLE company_balance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_company_balance_transactions" ON company_balance_transactions;
CREATE POLICY "manager_all_company_balance_transactions" ON company_balance_transactions
  FOR ALL USING (is_manager());

-- Атомарно и записывает операцию, и меняет баланс — чтобы страница
-- "Бизнес" не могла разойтись с суммой в company_balance_transactions,
-- если менеджер обновит вкладку в середине.
CREATE OR REPLACE FUNCTION public.add_company_balance_transaction(
  p_company_id uuid, p_amount numeric, p_type text, p_description text, p_created_by text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  IF NOT is_manager() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO company_balance_transactions (company_id, amount, type, description, created_by)
  VALUES (p_company_id, p_amount, p_type, p_description, p_created_by);

  UPDATE companies SET balance = balance + p_amount WHERE id = p_company_id
  RETURNING balance INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_company_balance_transaction(uuid, numeric, text, text, text) TO authenticated;

-- Клиентский RPC — история пополнений/списаний своей компании, тот же
-- принцип проверки членства, что и у остальных customer-facing функций.
CREATE OR REPLACE FUNCTION public.list_my_company_balance_transactions(p_email text, p_company_id uuid)
RETURNS TABLE(id uuid, amount numeric, type text, description text, created_at timestamptz)
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
  SELECT t.id, t.amount, t.type, t.description, t.created_at
  FROM company_balance_transactions t
  WHERE t.company_id = p_company_id
  ORDER BY t.created_at DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_company_balance_transactions(text, uuid) TO anon, authenticated;

-- list_my_companies дополняем балансом, чтобы кабинет не делал лишний
-- запрос только ради одного числа. CREATE OR REPLACE не может поменять
-- набор возвращаемых колонок у существующей функции — сначала дропаем.
DROP FUNCTION IF EXISTS public.list_my_companies(text);
CREATE OR REPLACE FUNCTION public.list_my_companies(p_email text)
RETURNS TABLE(id uuid, name text, ico text, dic text, is_vat_payer boolean, billing_address text, role text, balance numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.ico, c.dic, c.is_vat_payer, c.billing_address, cm.role, c.balance
  FROM companies c
  JOIN company_members cm ON cm.company_id = c.id
  WHERE lower(cm.email) = lower(btrim(p_email))
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_companies(text) TO anon, authenticated;


-- Регистрация фирмы из кабинета клиента больше не создаёт компанию
-- мгновенно — только заявку. Раньше (после ARES-проверки) сразу
-- создавали companies/company_members, но это позволяло кому угодно,
-- зная чужой IČO, самому себя прописать сотрудником уже существующей
-- фирмы и увидеть её счета/баланс. Теперь ARES по-прежнему проверяет
-- IČO сразу (чтобы не плодить заявки с несуществующими фирмами), но
-- окончательное решение — за менеджером на странице "Бизнес".
CREATE TABLE IF NOT EXISTS company_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ico text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  backup_email text,
  ares_name text NOT NULL,
  ares_address text,
  ares_dic text,
  ares_is_vat_payer boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  company_id uuid REFERENCES companies(id),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_registration_requests_email_idx
  ON company_registration_requests (lower(email), created_at DESC);

ALTER TABLE company_registration_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_company_registration_requests" ON company_registration_requests;
CREATE POLICY "manager_all_company_registration_requests" ON company_registration_requests
  FOR ALL USING (is_manager());

-- Клиент видит только статус своей последней заявки (пока нет решения
-- или было отклонено) — чтобы кабинет знал, что показывать вместо формы.
CREATE OR REPLACE FUNCTION public.get_my_company_request(p_email text)
RETURNS TABLE(id uuid, status text, ares_name text, created_at timestamptz, reviewed_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.status, r.ares_name, r.created_at, r.reviewed_at
  FROM company_registration_requests r
  WHERE lower(r.email) = lower(btrim(p_email))
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_company_request(text) TO anon, authenticated;
