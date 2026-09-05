-- Названия видов уже существуют в приложении — это ровно тот список,
-- которым менеджер размечает товары на вкладке "Магазин"
-- (FLOWER_TYPE_OPTIONS в web/src/app/dashboard/shop/page.tsx). Вместо
-- того чтобы вбивать их заново на складе, засеиваем species_reference
-- этим же списком — дальше страница "Магазин" эти же виды и читает
-- (см. следующий коммит), так что список общий в обе стороны.
DO $$
BEGIN
  ALTER TABLE species_reference ADD CONSTRAINT species_reference_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO species_reference (name, material_type, unit)
VALUES
  ('Tulipán', 'flower', 'стебель'),
  ('Karafiát', 'flower', 'стебель'),
  ('Pivoňka', 'flower', 'стебель'),
  ('Ranunkulus', 'flower', 'стебель'),
  ('Kala', 'flower', 'стебель'),
  ('Hortenzie', 'flower', 'стебель'),
  ('Hyacint', 'flower', 'стебель'),
  ('Fialka', 'flower', 'стебель'),
  ('Exotika', 'flower', 'стебель'),
  ('Vytrvalé', 'flower', 'стебель')
ON CONFLICT (name) DO NOTHING;
