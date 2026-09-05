-- Прошлая миграция (20260905020000) засеяла species_reference грубыми
-- категориями цветка (Pivoňka, Karafiát...) — это тот же список, что и
-- FLOWER_TYPE_OPTIONS на странице "Магазин", нужный только для фильтра
-- на сайте. Складу же нужны конкретные сорта — то, чем сейчас уже
-- торгуют поштучно (product_stickers.category = 'ohapka', плюс те же
-- товары без категории). Убираем неправильный сид, засеиваем реальными
-- названиями.
DELETE FROM species_reference
WHERE name IN ('Tulipán', 'Karafiát', 'Pivoňka', 'Ranunkulus', 'Kala', 'Hortenzie', 'Hyacint', 'Fialka', 'Exotika', 'Vytrvalé')
  AND NOT EXISTS (SELECT 1 FROM product_recipes WHERE species_id = species_reference.id)
  AND NOT EXISTS (SELECT 1 FROM batches WHERE species_id = species_reference.id);

INSERT INTO species_reference (name, material_type, unit)
VALUES
  ('Allium fialový', 'flower', 'стебель'),
  ('Anturium', 'flower', 'стебель'),
  ('Calla fialová', 'flower', 'стебель'),
  ('Eukalyptus', 'greenery', 'стебель'),
  ('Eustoma bílá', 'flower', 'стебель'),
  ('Eustoma fialová', 'flower', 'стебель'),
  ('Gerbera Nola', 'flower', 'стебель'),
  ('Heřmánek', 'flower', 'стебель'),
  ('Hortenezie bílá', 'flower', 'стебель'),
  ('Hortenzie růžová', 'flower', 'стебель'),
  ('Hortenzie světle-modrá', 'flower', 'стебель'),
  ('Hyacint modrý', 'flower', 'стебель'),
  ('Kala bílá', 'flower', 'стебель'),
  ('Kala Zazu', 'flower', 'стебель'),
  ('Kala Zazu Kornoutovka', 'flower', 'стебель'),
  ('Karafiát bílý spray', 'flower', 'стебель'),
  ('Karafiát burgundi', 'flower', 'стебель'),
  ('Karafiát růžový', 'flower', 'стебель'),
  ('Karafiat Kino', 'flower', 'стебель'),
  ('Karafiat Kiwi', 'flower', 'стебель'),
  ('Leucadendron', 'flower', 'стебель'),
  ('Leucospermum', 'flower', 'стебель'),
  ('Lilie růžová', 'flower', 'стебель'),
  ('Lilie rúžová mix', 'flower', 'стебель'),
  ('Magnolie 100-80cm', 'flower', 'стебель'),
  ('Matthiola bílá', 'flower', 'стебель'),
  ('Matthiola pink', 'flower', 'стебель'),
  ('Matthiola růžová', 'flower', 'стебель'),
  ('Mimosa', 'flower', 'стебель'),
  ('Narcis 32cm', 'flower', 'стебель'),
  ('Peony Sarah Bernard', 'flower', 'стебель'),
  ('Pivoňka bílá', 'flower', 'стебель'),
  ('Pivoňka červená dark', 'flower', 'стебель'),
  ('Pivoňka Coral Charm', 'flower', 'стебель'),
  ('Pivoňka koralová', 'flower', 'стебель'),
  ('Pivoňka Red Charm', 'flower', 'стебель'),
  ('Pivoňka růžová', 'flower', 'стебель'),
  ('Pivoňka Sarah Bernard', 'flower', 'стебель'),
  ('Protea', 'flower', 'стебель'),
  ('Ranunculus bílý', 'flower', 'стебель'),
  ('Ranunculus růžový', 'flower', 'стебель'),
  ('Růže Bombastik', 'flower', 'стебель'),
  ('Růže Bombastik spray', 'flower', 'стебель'),
  ('Růže Haley', 'flower', 'стебель'),
  ('Růže novia', 'flower', 'стебель'),
  ('Růže pink express', 'flower', 'стебель'),
  ('Slunečnice', 'flower', 'стебель'),
  ('Tulipan růžový', 'flower', 'стебель'),
  ('White peony', 'flower', 'стебель')
ON CONFLICT (name) DO NOTHING;
