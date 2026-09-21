-- Закрытие отдельных интервалов доставки ("9-12", "12-15", "15-18",
-- "18-20") на конкретную дату — например, курьеры на завтра уже
-- полностью заняты на 12-15, но остальные слоты и остальные дни
-- работают как обычно. Аналог shop_closed_dates, только не на весь день,
-- а на конкретный слот внутри дня. Не путать с delivery_slot в
-- tilda_orders — та колонка хранит слот, который клиент УЖЕ выбрал в
-- оформленном заказе, а эта таблица — конфигурация менеджера про то,
-- какие слоты ещё можно выбрать.

CREATE TABLE IF NOT EXISTS shop_closed_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closed_date date NOT NULL,
  slot_label text NOT NULL CHECK (slot_label IN ('9-12', '12-15', '15-18', '18-20')),
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (closed_date, slot_label)
);

ALTER TABLE shop_closed_slots ENABLE ROW LEVEL SECURITY;

-- Менеджер и склад закрывают/открывают слоты из кабинета — тот же круг
-- ролей, что уже управляет shop_closed_dates/shop_weekly_closed_days.
DROP POLICY IF EXISTS "manager_all_closed_slots" ON shop_closed_slots;
CREATE POLICY "manager_all_closed_slots" ON shop_closed_slots FOR ALL USING (
  is_manager() OR is_warehouse()
) WITH CHECK (
  is_manager() OR is_warehouse()
);

-- Страница оплаты на Tilda читает это анонимным ключом (как и
-- shop_closed_dates) — самому клиенту эти данные не показывают.
DROP POLICY IF EXISTS "public_read_closed_slots" ON shop_closed_slots;
CREATE POLICY "public_read_closed_slots" ON shop_closed_slots FOR SELECT USING (true);
