-- Сохранённый порядок объезда — переживает перезагрузку страницы и смену
-- статуса других заказов в том же маршруте (раньше порядок жил только в
-- памяти браузера и терялся при любом обновлении списка).
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS route_sequence integer;

-- Ставка теперь у каждого курьера своя (раньше была одна общая на всех).
ALTER TABLE users ADD COLUMN IF NOT EXISTS base_rate numeric NOT NULL DEFAULT 50;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rate_per_km numeric NOT NULL DEFAULT 9;

-- Переносим текущую общую ставку каждому существующему курьеру, чтобы после
-- миграции ничего не сломалось.
UPDATE users
SET base_rate = wl.base_rate, rate_per_km = wl.rate_per_km
FROM warehouse_location wl
WHERE users.role = 'courier' AND wl.id = true;
