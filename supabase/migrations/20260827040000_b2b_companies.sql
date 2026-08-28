-- B2B: компании, кто от их имени заказывает, и консолидированные счета.
-- Переиспользует существующие subscriptions/tilda_orders вместо отдельной
-- системы заказов — компания просто помечает уже существующие сущности.

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ico text,
  dic text,
  is_vat_payer boolean NOT NULL DEFAULT false,
  billing_address text,
  contact_name text,
  contact_email text NOT NULL,
  contact_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Кто может заказывать от лица компании — тот же принцип "клиент по
-- email", что и у обычных покупателей (полноценной авторизации у них
-- тоже нет). admin — видит счета и может менять бюджет, member — просто
-- заказывает в рамках лимита.
CREATE TABLE IF NOT EXISTS company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  monthly_budget numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_company_members_email ON company_members (lower(email));

-- Консолидированный счёт за период — вместо счёта на каждый заказ.
CREATE TABLE IF NOT EXISTS company_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  issued_at timestamptz,
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_invoices_company ON company_invoices (company_id);

-- Заказ/подписка привязывается к компании — так и обычные разовые B2B
-- заказы, и подписочные попадают в один и тот же учёт.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- Заказы, сгенерированные из подписки (через существующую edge-функцию
-- subscriptions-generate-orders, её исходники не в этом репозитории),
-- не будут сами знать о company_id — синхронизируем автоматически по
-- subscription_id, чтобы не трогать код той функции.
CREATE OR REPLACE FUNCTION sync_order_company_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.subscription_id IS NOT NULL AND NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM subscriptions WHERE id = NEW.subscription_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_order_company_id ON tilda_orders;
CREATE TRIGGER trigger_sync_order_company_id
BEFORE INSERT OR UPDATE ON tilda_orders
FOR EACH ROW EXECUTE FUNCTION sync_order_company_id();

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_companies" ON companies;
CREATE POLICY "manager_all_companies" ON companies FOR ALL USING (is_manager());

DROP POLICY IF EXISTS "manager_all_company_members" ON company_members;
CREATE POLICY "manager_all_company_members" ON company_members FOR ALL USING (is_manager());

DROP POLICY IF EXISTS "manager_all_company_invoices" ON company_invoices;
CREATE POLICY "manager_all_company_invoices" ON company_invoices FOR ALL USING (is_manager());
