-- Готовим journal под прямой маппинг в Google Sheets без единой строчки
-- логики в n8n: расход и приход уже разложены по отдельным колонкам
-- (как в прежней ручной таблице), плюс человеческий тип операции.
-- Добавляем только новые колонки в конец — CREATE OR REPLACE VIEW не
-- даёт менять порядок/имена уже существующих.
CREATE OR REPLACE VIEW accounting_ledger AS
SELECT
  t.*,
  CASE t.entry_type
    WHEN 'revenue' THEN 'Продажа'
    WHEN 'purchase' THEN 'Закупка'
    WHEN 'write_off' THEN 'Списание'
    WHEN 'expense' THEN 'Расход'
  END AS entry_type_label,
  CASE WHEN t.amount < 0 THEN -t.amount ELSE NULL END AS expense_czk,
  CASE WHEN t.amount > 0 THEN t.amount ELSE NULL END AS income_czk
FROM (
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
  FROM business_expenses
) t;
