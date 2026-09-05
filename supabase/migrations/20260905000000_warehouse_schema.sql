-- Фаза 0 модуля склада — только схема, без интерфейса. Список решений
-- см. в артефакте "Sklad Narin" от 28.08: рецепт — мост между каталогом
-- и сырьём, остаток — сумма журнала (stock_movements), а не число,
-- точка списания — существующая стадия заказа "assembling" (добавится
-- в Фазе 2, здесь только таблицы).

CREATE TABLE IF NOT EXISTS species_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  material_type text NOT NULL CHECK (material_type IN ('flower', 'greenery', 'packaging')),
  default_vase_life_days int,
  unit text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_phone text,
  contact_email text,
  payment_terms_days int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received')),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  species_id uuid NOT NULL REFERENCES species_reference(id),
  quantity numeric NOT NULL,
  unit_price numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Рецепт — мост между тем, что покупает клиент (product_stickers, уже
-- есть), и тем, что лежит на складе (species_reference).
CREATE TABLE IF NOT EXISTS product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_sticker_id uuid NOT NULL REFERENCES product_stickers(id) ON DELETE CASCADE,
  species_id uuid NOT NULL REFERENCES species_reference(id),
  quantity_needed numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_sticker_id, species_id)
);

-- Партия — можно завести и без purchase_order (например, по инвойсу
-- с почты, без формального заказа наперёд).
CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species_id uuid NOT NULL REFERENCES species_reference(id),
  supplier_id uuid REFERENCES suppliers(id),
  purchase_order_id uuid REFERENCES purchase_orders(id),
  quantity_received numeric NOT NULL,
  remaining numeric NOT NULL,
  purchase_price_per_unit numeric,
  purchase_date date NOT NULL DEFAULT current_date,
  estimated_wilt_date date,
  quality_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  photo_url text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS batches_species_idx ON batches (species_id, purchase_date);

-- Журнал движений — источник правды для остатка. batches.remaining —
-- это кэш, который держит триггер ниже; сам по себе не редактируется.
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id),
  change_qty numeric NOT NULL,
  reason text NOT NULL CHECK (reason IN ('received', 'sold', 'written_off', 'adjustment')),
  reference_type text CHECK (reference_type IN ('order', 'write_off', 'check')),
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_batch_idx ON stock_movements (batch_id, created_at);

CREATE OR REPLACE FUNCTION tg_apply_stock_movement()
RETURNS trigger AS $$
BEGIN
  UPDATE batches SET remaining = remaining + NEW.change_qty WHERE id = NEW.batch_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_apply_stock_movement ON stock_movements;
CREATE TRIGGER trigger_apply_stock_movement
AFTER INSERT ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION tg_apply_stock_movement();

CREATE TABLE IF NOT EXISTS write_offs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id),
  quantity numeric NOT NULL,
  reason text NOT NULL CHECK (reason IN ('wilted', 'damaged', 'defect', 'miscount')),
  photo_url text NOT NULL,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Списание пишется через write_offs, а не напрямую в stock_movements —
-- триггер сам заводит запись в журнале, чтобы не было двух мест правды.
CREATE OR REPLACE FUNCTION tg_write_off_to_stock_movement()
RETURNS trigger AS $$
BEGIN
  INSERT INTO stock_movements (batch_id, change_qty, reason, reference_type, reference_id, created_by)
  VALUES (NEW.batch_id, -NEW.quantity, 'written_off', 'write_off', NEW.id, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_write_off_to_stock_movement ON write_offs;
CREATE TRIGGER trigger_write_off_to_stock_movement
AFTER INSERT ON write_offs
FOR EACH ROW
EXECUTE FUNCTION tg_write_off_to_stock_movement();

-- Плановая сверка факт/система — если посчитанное расходится с тем,
-- что в журнале, разница сама пишется как adjustment.
CREATE TABLE IF NOT EXISTS inventory_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id),
  counted_quantity numeric NOT NULL,
  system_quantity numeric NOT NULL,
  discrepancy numeric GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION tg_inventory_check_adjustment()
RETURNS trigger AS $$
BEGIN
  IF NEW.counted_quantity <> NEW.system_quantity THEN
    INSERT INTO stock_movements (batch_id, change_qty, reason, reference_type, reference_id, created_by)
    VALUES (NEW.batch_id, NEW.counted_quantity - NEW.system_quantity, 'adjustment', 'check', NEW.id, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_inventory_check_adjustment ON inventory_checks;
CREATE TRIGGER trigger_inventory_check_adjustment
AFTER INSERT ON inventory_checks
FOR EACH ROW
EXECUTE FUNCTION tg_inventory_check_adjustment();

-- RLS: доступ только менеджеру и складу (флористу) — это внутренний
-- операционный учёт, ни анону, ни клиенту тут делать нечего.
CREATE OR REPLACE FUNCTION public.is_warehouse()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'warehouse');
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'species_reference', 'suppliers', 'purchase_orders', 'purchase_order_items',
    'product_recipes', 'batches', 'stock_movements', 'write_offs', 'inventory_checks'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "warehouse_staff_all_%s" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "warehouse_staff_all_%s" ON %I FOR ALL USING (is_manager() OR is_warehouse()) WITH CHECK (is_manager() OR is_warehouse())',
      t, t
    );
  END LOOP;
END $$;
