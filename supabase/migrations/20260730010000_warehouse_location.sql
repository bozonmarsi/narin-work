-- Единая (одна строка) настройка адреса склада — точка отсчёта для
-- построения маршрута курьера. Редактируется менеджером через приложение,
-- координаты пересчитываются автоматически при смене адреса (см. геокодинг
-- на стороне Next.js).
CREATE TABLE IF NOT EXISTS warehouse_location (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  address text NOT NULL,
  lat float8,
  lng float8,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO warehouse_location (id, address, lat, lng)
VALUES (true, 'Rumunská 17, 120 00 Praha', 50.0740793, 14.4319307)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE warehouse_location ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouse_location_select ON warehouse_location
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY warehouse_location_update ON warehouse_location
  FOR UPDATE
  TO authenticated
  USING (is_manager())
  WITH CHECK (is_manager());
