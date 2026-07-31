-- Narin flower shop delivery management schema
-- Extends existing tables: tilda_orders, Tilda_points, points_transactions
-- Safe to re-run: enums via DO blocks, tables/columns via IF NOT EXISTS,
-- policies via DROP POLICY IF EXISTS + CREATE POLICY.

-- =========================================================
-- 1. ENUM TYPES (created first, idempotent via DO blocks)
-- =========================================================

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM (
    'new',              -- пришёл с Tilda, ждёт менеджера
    'confirmed',        -- менеджер подтвердил, виден складу и в пуле курьеров
    'courier_assigned', -- курьер принял заказ из пула
    'assembling',       -- склад начал сборку
    'assembled',        -- склад собрал, готов к выдаче
    'in_transit',       -- курьер выехал (нажал "В пути")
    'arriving',         -- курьер подъезжает (нажал "Через 10 минут", авто-SMS получателю)
    'delivered',        -- доставлен
    'not_home',         -- не застал получателя
    'problem',          -- проблема от курьера или склада
    'transfer_pending', -- ожидает подтверждения переноса менеджером
    'cancelled'         -- отменён
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE problem_type AS ENUM (
    'not_home',
    'wrong_address',
    'refused',
    'warehouse_issue',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'manager',
    'courier',
    'warehouse'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- 2. users TABLE (must exist before FKs from tilda_orders)
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role user_role NOT NULL,
  phone text,
  created_at timestamptz DEFAULT now()
);

-- =========================================================
-- 3. ALTER tilda_orders — logistics/status columns
-- =========================================================

-- Статус и логистика
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS status delivery_status DEFAULT 'new';
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS assigned_courier_id uuid REFERENCES users(id);
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS distance_km float8;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS delivery_price numeric;

-- Окно доставки (парсим из delivery_slot "9-12" → конкретные timestamptz)
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS delivery_window_start timestamptz;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS delivery_window_end timestamptz;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS warehouse_ready_by timestamptz; -- delivery_window_start - 30 мин

-- Координаты получателя (для расчёта км через Google Distance Matrix)
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS recipient_lat float8;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS recipient_lng float8;

-- Подтверждение менеджером
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES users(id);
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS cancelled_reason text;

-- Запрос на перенос (от курьера, подтверждает менеджер)
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS transfer_requested boolean DEFAULT false;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS transfer_requested_at timestamptz;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS transfer_reason text;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS transfer_proposed_date date;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS transfer_proposed_window_start timestamptz;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS transfer_proposed_window_end timestamptz;

-- Проблема (от курьера или склада)
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS problem_reported boolean DEFAULT false;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS problem_type problem_type;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS problem_comment text;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS problem_photo_url text;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS problem_reported_at timestamptz;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS problem_reported_by uuid REFERENCES users(id);

-- =========================================================
-- 4. order_status_history TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES tilda_orders(id) ON DELETE CASCADE,
  status delivery_status NOT NULL,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz DEFAULT now(),
  note text
);

-- =========================================================
-- 5. RLS
-- =========================================================

ALTER TABLE tilda_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- --- users ---

DROP POLICY IF EXISTS "users_self" ON users;
CREATE POLICY "users_self" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "manager_all_users" ON users;
CREATE POLICY "manager_all_users" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
  );

-- --- tilda_orders: SELECT ---

-- courier: свои назначенные заказы + пул (status = 'confirmed', ещё не разобран)
DROP POLICY IF EXISTS "courier_orders" ON tilda_orders;
CREATE POLICY "courier_orders" ON tilda_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'courier')
    AND (assigned_courier_id = auth.uid() OR status = 'confirmed')
  );

-- warehouse: заказы в работе склада
DROP POLICY IF EXISTS "warehouse_orders" ON tilda_orders;
CREATE POLICY "warehouse_orders" ON tilda_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'warehouse')
    AND status IN ('confirmed','courier_assigned','assembling','assembled','in_transit')
  );

-- manager: видит и управляет всем
DROP POLICY IF EXISTS "manager_orders" ON tilda_orders;
CREATE POLICY "manager_orders" ON tilda_orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
  );

-- --- tilda_orders: UPDATE ---
-- Без этих политик курьер/склад не смогут менять статус через клиент
-- (нажать "В пути", "Через 10 минут", взять заказ из пула, проставить assembling/assembled и т.д.)

-- courier: может обновлять свой назначенный заказ, либо забрать заказ из пула
-- (status = 'confirmed' и ещё не назначен), но после обновления заказ обязан
-- остаться закреплён именно за ним.
DROP POLICY IF EXISTS "courier_orders_update" ON tilda_orders;
CREATE POLICY "courier_orders_update" ON tilda_orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'courier')
    AND (assigned_courier_id = auth.uid() OR (status = 'confirmed' AND assigned_courier_id IS NULL))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'courier')
    AND assigned_courier_id = auth.uid()
  );

-- warehouse: может обновлять заказы, пока они в рабочих для склада статусах
DROP POLICY IF EXISTS "warehouse_orders_update" ON tilda_orders;
CREATE POLICY "warehouse_orders_update" ON tilda_orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'warehouse')
    AND status IN ('confirmed','courier_assigned','assembling','assembled','in_transit')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'warehouse')
    AND status IN ('confirmed','courier_assigned','assembling','assembled','in_transit')
  );

-- --- order_status_history ---

DROP POLICY IF EXISTS "history_courier" ON order_status_history;
CREATE POLICY "history_courier" ON order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tilda_orders o
      WHERE o.id = order_status_history.order_id
      AND (o.assigned_courier_id = auth.uid() OR o.status = 'confirmed')
    )
  );

DROP POLICY IF EXISTS "history_courier_insert" ON order_status_history;
CREATE POLICY "history_courier_insert" ON order_status_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tilda_orders o
      WHERE o.id = order_status_history.order_id AND o.assigned_courier_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "history_warehouse" ON order_status_history;
CREATE POLICY "history_warehouse" ON order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tilda_orders o
      JOIN users u ON u.id = auth.uid()
      WHERE o.id = order_status_history.order_id AND u.role = 'warehouse'
      AND o.status IN ('confirmed','courier_assigned','assembling','assembled','in_transit')
    )
  );

DROP POLICY IF EXISTS "history_warehouse_insert" ON order_status_history;
CREATE POLICY "history_warehouse_insert" ON order_status_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tilda_orders o
      JOIN users u ON u.id = auth.uid()
      WHERE o.id = order_status_history.order_id AND u.role = 'warehouse'
      AND o.status IN ('confirmed','courier_assigned','assembling','assembled','in_transit')
    )
  );

DROP POLICY IF EXISTS "history_manager" ON order_status_history;
CREATE POLICY "history_manager" ON order_status_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
  );

-- =========================================================
-- 6. Автосоздание пользователя при регистрации
-- =========================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO users (id, full_name, role, phone)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    (new.raw_user_meta_data->>'role')::user_role,
    new.raw_user_meta_data->>'phone'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =========================================================
-- 7. Индексы
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_orders_status ON tilda_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON tilda_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_courier ON tilda_orders(assigned_courier_id);
CREATE INDEX IF NOT EXISTS idx_history_order ON order_status_history(order_id);

-- =========================================================
-- 8. Realtime
-- =========================================================
-- Выполнить вручную в Supabase Dashboard → Database → Replication:
-- включить Realtime для таблиц tilda_orders и order_status_history.
