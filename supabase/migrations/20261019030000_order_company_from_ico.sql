-- Objednavka z pokladny nese fakturacni udaje firmy ("company-ico" v raw_payload).
-- Kdyz je zakaznik (customer_email) clenem firmy s timto ICO, objednavka se sama
-- priradi k firme (company_id). Cizi ICO nikdy nepriradi: bez clenstvi zustane
-- company_id prazdne a udaje o firme jsou jen v raw_payload pro fakturu.
CREATE OR REPLACE FUNCTION public.set_order_company_from_ico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ico text;
  v_company uuid;
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_ico := regexp_replace(coalesce(NEW.raw_payload->>'company-ico', ''), '\s', '', 'g');
  IF v_ico !~ '^\d{8}$' OR coalesce(NEW.customer_email, '') = '' THEN
    RETURN NEW;
  END IF;
  SELECT c.id INTO v_company
  FROM companies c
  JOIN company_members m ON m.company_id = c.id
  WHERE c.ico = v_ico AND lower(m.email) = lower(btrim(NEW.customer_email))
  LIMIT 1;
  IF v_company IS NOT NULL THEN
    NEW.company_id := v_company;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_order_company_from_ico ON tilda_orders;
CREATE TRIGGER trigger_set_order_company_from_ico
BEFORE INSERT OR UPDATE OF raw_payload, customer_email ON tilda_orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_company_from_ico();
