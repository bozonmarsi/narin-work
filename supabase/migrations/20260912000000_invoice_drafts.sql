-- Черновики приёмки, распознанные из фактур на почте (n8n читает
-- вложения, гонит текст через Claude, парсит позиции и сопоставляет их
-- с нашим каталогом — сам механизм чтения почты и разбора PDF живёт вне
-- этого репозитория, в n8n). Сюда n8n только ПИШЕТ через service_role
-- ключ (как tilda-webhook уже делает с tilda_orders) — обычным
-- сотрудникам INSERT не нужен, только читать и подтверждать/отклонять.
--
-- items — массив объектов вида:
--   { "supplier_item_name": "Rosa Freedom 60cm", "quantity": 50,
--     "unit_price": 12.5, "matched_product_sticker_id": "<uuid|null>" }
-- matched_product_sticker_id — лучшее предположение Claude по каталогу;
-- флорист его видит как предзаполненный выбор и может поправить перед
-- подтверждением — партия на склад заводится только по его явному клику,
-- не автоматически.
CREATE TABLE IF NOT EXISTS invoice_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name text,
  supplier_id uuid REFERENCES suppliers(id),
  invoice_number text,
  invoice_date date,
  drive_url text,
  items jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse_staff_all_invoice_drafts" ON invoice_drafts;
CREATE POLICY "warehouse_staff_all_invoice_drafts" ON invoice_drafts
  FOR ALL USING (is_manager() OR is_warehouse());
