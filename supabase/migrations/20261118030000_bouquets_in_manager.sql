-- Букеты в менеджерке: категория «Букеты» (buket) уже есть во вкладке Магазин, тут добавляются сами букеты.
-- Карточки в Tilda (категория Kytice) уже созданы 2026-11-18, у каждого S/M/L или один размер.
-- quantity = сколько готовых букетов есть сейчас (0 = нет в наличии), как у Kovky.
-- Цена берётся из Tilda (её вписывает владелец там или пишет мне).
insert into product_stickers (product_name, image_url, tilda_uid, tilda_url, category, quantity, order_unit_size, added_to_tilda, manually_hidden)
select v.n, v.img, v.uid, 'https://vezminarin.cz/tproduct/' || v.uid, 'buket', 0, 1, true, false
from (values
  ('Clara Stahlbaum', 'https://static.tildacdn.com/tila6464-6234-4437-a664-653938326236/kytice-zima_cervena-.webp', '854913749674'),
  ('Lucy Pevensie', 'https://static.tildacdn.com/tila3861-3964-4963-b239-326464343161/kytice-zima_bila-M.webp', '470555828164'),
  ('Margarita', 'https://static.tildacdn.com/tila6261-3139-4336-a430-383331336430/kytice-bordo-M.webp', '337106830694'),
  ('Anne Shirley', 'https://static.tildacdn.com/tila3662-3534-4664-b661-353664306366/kytice-ruzova-M.webp', '370679130724'),
  ('Matilda Wormwood', 'https://static.tildacdn.com/tila6539-3336-4063-b366-623734333738/kytice-pastel-M.webp', '852946763324'),
  ('Daisy Buchanan', 'https://static.tildacdn.com/tila6434-3932-4865-b462-353462326536/kytice-bile-ruze.webp', '338915278194'),
  ('Holly Golightly', 'https://static.tildacdn.com/tila3465-3864-4636-b463-333332393337/kytice-broskev.webp', '820957205954')
) v(n, img, uid)
where not exists (select 1 from product_stickers p where p.product_name = v.n and p.archived = false);
