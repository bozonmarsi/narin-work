-- Ставка оплаты курьеру: база за доставку + за километр, редактируется
-- менеджером (та же таблица-синглтон, что и адрес склада).
ALTER TABLE warehouse_location ADD COLUMN IF NOT EXISTS base_rate numeric NOT NULL DEFAULT 50;
ALTER TABLE warehouse_location ADD COLUMN IF NOT EXISTS rate_per_km numeric NOT NULL DEFAULT 9;
