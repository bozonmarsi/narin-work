-- Polozky faktury: k objednavkam obdobi pridavame cast platebniho zaznamu (zbozi, cena doruceni, soucty),
-- aby PDF napsal, za co se platilo. Zadne osobni udaje prijemce (adresa, jmeno) se nevraci.
DROP FUNCTION IF EXISTS public.list_invoice_period_orders(text, uuid);
CREATE OR REPLACE FUNCTION public.list_invoice_period_orders(p_email text, p_invoice_id uuid)
RETURNS TABLE(order_id text, delivery_date date, order_total numeric, payment jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.order_id, o.delivery_date::date, o.order_total,
         jsonb_build_object(
           'products', o.raw_payload->'payment'->'products',
           'subtotal', o.raw_payload->'payment'->'subtotal',
           'delivery', o.raw_payload->'payment'->'delivery',
           'delivery_price', o.raw_payload->'payment'->'delivery_price',
           'amount', o.raw_payload->'payment'->'amount'
         )
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
