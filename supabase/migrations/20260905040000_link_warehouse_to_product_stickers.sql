-- Убираем species_reference как отдельную сущность — это дублировало
-- каталог товаров (product_stickers), который и так уже пополняется
-- флористом/менеджером через обычную кнопку "+ Добавить" на странице
-- "Магазин". Склад теперь ссылается прямо на product_stickers: новый
-- вид сырья заводится там же, где и любой другой товар, и сразу
-- доступен на складе — без отдельной формы и без дублирования.
--
-- Заодно product_stickers.quantity перестаёт быть "нарисованным"
-- числом, которое двигают только кнопки ±1 на "Магазине" — теперь его
-- же двигает реальная приёмка/списание склада. Ручные кнопки не
-- убираем (иногда нужно поправить руками), они просто пишут в то же
-- поле, что и склад.

-- 1. Нормализуем данные: часть товаров-цветов по факту "ohapka"
-- (продаются поштучно одним видом), но категория не была проставлена.
UPDATE product_stickers
SET category = 'ohapka'
WHERE category IS NULL AND product_name <> '__default__';

-- 2. Метаданные склада переезжают на сам product_stickers — раньше
-- жили в species_reference.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS material_type text
  CHECK (material_type IN ('flower', 'greenery', 'packaging'));
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS default_vase_life_days int;

UPDATE product_stickers
SET material_type = COALESCE(material_type, 'flower'),
    unit = COALESCE(unit, 'стебель')
WHERE category = 'ohapka';

UPDATE product_stickers SET material_type = 'greenery' WHERE product_name = 'Eukalyptus';

-- 3. Перевешиваем FK со species_reference на product_stickers.
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_species_id_fkey;
ALTER TABLE batches RENAME COLUMN species_id TO product_sticker_id;
ALTER TABLE batches ADD CONSTRAINT batches_product_sticker_id_fkey
  FOREIGN KEY (product_sticker_id) REFERENCES product_stickers(id);

ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_species_id_fkey;
ALTER TABLE purchase_order_items RENAME COLUMN species_id TO product_sticker_id;
ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_product_sticker_id_fkey
  FOREIGN KEY (product_sticker_id) REFERENCES product_stickers(id);

-- product_recipes раньше держал одну FK на product_stickers (готовый
-- букет) и одну на species_reference (сырьё) — теперь обе смотрят на
-- product_stickers, поэтому колонки переименовываем, чтобы не путались.
ALTER TABLE product_recipes DROP CONSTRAINT IF EXISTS product_recipes_product_sticker_id_fkey;
ALTER TABLE product_recipes DROP CONSTRAINT IF EXISTS product_recipes_species_id_fkey;
ALTER TABLE product_recipes DROP CONSTRAINT IF EXISTS product_recipes_product_sticker_id_species_id_key;
ALTER TABLE product_recipes RENAME COLUMN product_sticker_id TO bouquet_sticker_id;
ALTER TABLE product_recipes RENAME COLUMN species_id TO ingredient_sticker_id;
ALTER TABLE product_recipes ADD CONSTRAINT product_recipes_bouquet_sticker_id_fkey
  FOREIGN KEY (bouquet_sticker_id) REFERENCES product_stickers(id) ON DELETE CASCADE;
ALTER TABLE product_recipes ADD CONSTRAINT product_recipes_ingredient_sticker_id_fkey
  FOREIGN KEY (ingredient_sticker_id) REFERENCES product_stickers(id);
ALTER TABLE product_recipes ADD CONSTRAINT product_recipes_bouquet_ingredient_key
  UNIQUE (bouquet_sticker_id, ingredient_sticker_id);

DROP TABLE IF EXISTS species_reference CASCADE;

-- 4. Триггер по приходу/расходу теперь двигает ОБЕ цифры: остаток
-- конкретной партии (для FIFO/свежести) и агрегат в product_stickers.quantity
-- (то же число, что видит менеджер на "Магазине" и сайт в бейдже "Zbývá N ks").
CREATE OR REPLACE FUNCTION tg_apply_stock_movement()
RETURNS trigger AS $$
BEGIN
  UPDATE batches SET remaining = remaining + NEW.change_qty WHERE id = NEW.batch_id;
  UPDATE product_stickers ps
  SET quantity = COALESCE(ps.quantity, 0) + NEW.change_qty
  FROM batches b
  WHERE b.id = NEW.batch_id AND ps.id = b.product_sticker_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
