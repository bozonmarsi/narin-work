-- Общие расходы бизнеса, которые не завязаны на закупку цветов и раньше
-- нигде в базе не жили (аренда машины, зарплата, упаковка, реклама,
-- офис, хостинг) — то, что менеджер до этого вёл в отдельной Google
-- таблице. Только менеджер, не склад/флорист — это финансовые данные,
-- не операционные.
CREATE TABLE IF NOT EXISTS business_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at date NOT NULL DEFAULT current_date,
  amount numeric NOT NULL CHECK (amount > 0),
  category text NOT NULL,
  subcategory text,
  counterparty text,
  document_ref text,
  description text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_business_expenses" ON business_expenses;
CREATE POLICY "manager_all_business_expenses" ON business_expenses
  FOR ALL USING (is_manager());

-- Журнал целиком пересобираем: добавляем business_expenses четвёртой
-- веткой и дописываем состав заказа в revenue.notes (раньше было пусто —
-- "надо писать, что взял").
CREATE OR REPLACE VIEW accounting_ledger AS
SELECT
  'revenue'::text AS entry_type,
  created_at AS occurred_at,
  id::text AS reference,
  order_id AS reference_label,
  payment_method AS method,
  order_total AS amount,
  customer_email AS counterparty,
  (
    SELECT string_agg(decode_html_entities(p->>'name') || ' × ' || coalesce(p->>'quantity', '1'), ', ')
    FROM jsonb_array_elements(raw_payload -> 'payment' -> 'products') p
  ) AS notes
FROM tilda_orders
WHERE payment_status = '🟢 Оплачено'

UNION ALL

SELECT
  'purchase'::text AS entry_type,
  (b.purchase_date::timestamptz) AS occurred_at,
  b.id::text AS reference,
  ps.product_name AS reference_label,
  NULL::text AS method,
  -(b.quantity_received * coalesce(b.purchase_price_per_unit, 0)) AS amount,
  s.name AS counterparty,
  NULL::text AS notes
FROM batches b
LEFT JOIN suppliers s ON s.id = b.supplier_id
LEFT JOIN product_stickers ps ON ps.id = b.product_sticker_id

UNION ALL

SELECT
  'write_off'::text AS entry_type,
  wo.created_at AS occurred_at,
  wo.id::text AS reference,
  ps.product_name AS reference_label,
  NULL::text AS method,
  -(wo.quantity * coalesce(b.purchase_price_per_unit, 0)) AS amount,
  NULL::text AS counterparty,
  wo.reason AS notes
FROM write_offs wo
JOIN batches b ON b.id = wo.batch_id
LEFT JOIN product_stickers ps ON ps.id = b.product_sticker_id

UNION ALL

SELECT
  'expense'::text AS entry_type,
  occurred_at::timestamptz AS occurred_at,
  id::text AS reference,
  category AS reference_label,
  NULL::text AS method,
  -amount AS amount,
  counterparty AS counterparty,
  coalesce(description, '') || CASE WHEN subcategory IS NOT NULL THEN ' [' || subcategory || ']' ELSE '' END AS notes
FROM business_expenses;

CREATE OR REPLACE VIEW accounting_daily AS
SELECT
  (occurred_at AT TIME ZONE 'Europe/Prague')::date AS day,
  coalesce(sum(amount) FILTER (WHERE entry_type = 'revenue'), 0) AS revenue,
  coalesce(-sum(amount) FILTER (WHERE entry_type = 'purchase'), 0) AS purchases,
  coalesce(-sum(amount) FILTER (WHERE entry_type = 'write_off'), 0) AS write_off_loss,
  coalesce(-sum(amount) FILTER (WHERE entry_type = 'expense'), 0) AS other_expenses,
  coalesce(sum(amount), 0) AS net
FROM accounting_ledger
GROUP BY 1
ORDER BY 1 DESC;
