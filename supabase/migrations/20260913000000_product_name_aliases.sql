-- Поставщики называют один и тот же товар по-разному (сорт/латынь вместо
-- нашего чешского названия) — вместо того чтобы заводить отдельный товар
-- на каждый вариант названия (раздувает каталог/кассу тем, что клиенту
-- и рецептам не нужно), храним словарь "как называет поставщик" →
-- "какой у нас товар". n8n при разборе фактуры сначала ищет точное
-- совпадение здесь и только для нераспознанных просит Claude угадать —
-- со временем словарь растёт и угадывать нужно всё реже.
--
-- Поставщицкое название нигде дальше не всплывает: оно живёт только тут
-- и в invoice_drafts.items (черновик, который исчезает после
-- подтверждения/отклонения) — в batches/stock_movements/заказы пишется
-- только product_sticker_id, само поставщицкое название туда не попадает.
CREATE TABLE IF NOT EXISTS product_name_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  alias text NOT NULL,
  product_sticker_id uuid NOT NULL REFERENCES product_stickers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_name_aliases_lookup_idx
  ON product_name_aliases (supplier_id, lower(alias));

ALTER TABLE product_name_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse_staff_all_product_name_aliases" ON product_name_aliases;
CREATE POLICY "warehouse_staff_all_product_name_aliases" ON product_name_aliases
  FOR ALL USING (is_manager() OR is_warehouse());
