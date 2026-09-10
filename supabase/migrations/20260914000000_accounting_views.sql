-- Бухгалтерский журнал — построчно по каждой операции (заказ/закупка/
-- списание), а не сразу сводка по дням. Сводку бухгалтер сам сведёт
-- пивот-таблицей в Sheets за секунды; а вот из готовой дневной суммы
-- обратно к конкретному заказу/фактуре не вернёшься, если что-то
-- понадобится сверить. reference — id соответствующей записи (заказ,
-- партия, списание), по нему всегда можно найти исходную операцию в
-- самой базе, если бухгалтеру нужны детали сверх того, что в journal.
--
-- НДС/DPH сознательно не считаем — это зависит от статуса плательщика
-- НДС, который должен подтвердить сам бухгалтер, не тут.
CREATE OR REPLACE VIEW accounting_ledger AS
SELECT
  'revenue'::text AS entry_type,
  created_at AS occurred_at,
  id::text AS reference,
  order_id AS reference_label,
  payment_method AS method,
  order_total AS amount,
  customer_email AS counterparty,
  NULL::text AS notes
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
LEFT JOIN product_stickers ps ON ps.id = b.product_sticker_id;

-- Дневная сводка — просто агрегат журнала выше, для быстрого взгляда
-- "как идут дела сегодня" без похода в Sheets.
CREATE OR REPLACE VIEW accounting_daily AS
SELECT
  (occurred_at AT TIME ZONE 'Europe/Prague')::date AS day,
  coalesce(sum(amount) FILTER (WHERE entry_type = 'revenue'), 0) AS revenue,
  -- purchase/write_off хранятся в журнале отрицательными (это расход) —
  -- тут разворачиваем обратно в положительные суммы, так читаемее.
  coalesce(-sum(amount) FILTER (WHERE entry_type = 'purchase'), 0) AS purchases,
  coalesce(-sum(amount) FILTER (WHERE entry_type = 'write_off'), 0) AS write_off_loss,
  coalesce(sum(amount), 0) AS net
FROM accounting_ledger
GROUP BY 1
ORDER BY 1 DESC;
