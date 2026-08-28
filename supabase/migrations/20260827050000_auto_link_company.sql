-- Раньше компанию для заказа нужно было заводить вручную (как с
-- RADCHENKO). Теперь: если у заказа заполнено название компании
-- (company_name — это поле уже есть в форме оплаты), система сама:
--   1. Ищет компанию по email клиента среди уже известных company_members
--      (тот же человек заказывал раньше от лица какой-то компании).
--   2. Если не нашла — ищет компанию с таким же названием (без учёта
--      регистра) — новый сотрудник уже известной компании.
--   3. Если и это не нашла — заводит новую компанию и делает клиента
--      её админом.
-- Подписочные заказы (subscription_id уже задан) сюда не попадают —
-- для них company_id уже приходит из самой подписки, это надёжнее
-- текстового совпадения по названию.
CREATE OR REPLACE FUNCTION auto_link_company()
RETURNS trigger AS $$
DECLARE
  v_email text := lower(btrim(NEW.customer_email));
  v_company_name text := btrim(NEW.company_name);
  v_company_id uuid;
BEGIN
  IF v_email = '' OR v_company_name = '' THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO v_company_id
  FROM company_members
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id
    FROM companies
    WHERE lower(name) = lower(v_company_name)
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    INSERT INTO companies (name, contact_name, contact_email)
    VALUES (v_company_name, NEW.customer_name, v_email)
    RETURNING id INTO v_company_id;

    INSERT INTO company_members (company_id, email, role)
    VALUES (v_company_id, v_email, 'admin')
    ON CONFLICT (company_id, email) DO NOTHING;
  ELSE
    INSERT INTO company_members (company_id, email, role)
    VALUES (v_company_id, v_email, 'member')
    ON CONFLICT (company_id, email) DO NOTHING;
  END IF;

  NEW.company_id := v_company_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_link_company ON tilda_orders;
CREATE TRIGGER trigger_auto_link_company
BEFORE INSERT OR UPDATE ON tilda_orders
FOR EACH ROW
WHEN (NEW.company_id IS NULL AND NEW.subscription_id IS NULL AND NEW.company_name IS NOT NULL AND NEW.company_name <> '')
EXECUTE FUNCTION auto_link_company();
