-- Tri nove vazy v Atelieru (Tilda part Atelier + Kvetiny). Cena podle majitele: 190 / 220 / 280 Kc.
-- Bez sledovani poctu (quantity null) jako ostatni pomucky. Do doporuceni v okne kvetiny
-- se dostanou samy: get_product_card_bundle bere vse z kategorie atelier, accessory_kind = vase.
insert into product_stickers (product_name, image_url, tilda_uid, tilda_url, category, price, quantity, order_unit_size, added_to_tilda, manually_hidden, special_order)
select v.name, v.img, v.uid, 'https://vezminarin.cz/tproduct/' || v.uid, 'atelier', v.price, null, 1, true, false, false
from (values
  ('Váza Rýhovaná 20 cm', '944949807374', 190, 'https://static.tildacdn.com/tila3830-3835-4233-b862-653566323363/vaza-ryhovana.webp'),
  ('Váza Plástev 24 cm',  '133595324234', 220, 'https://static.tildacdn.com/tila6631-3466-4462-b333-333161663730/vaza-plastev.webp'),
  ('Váza Vlnky 26 cm',    '304053785714', 280, 'https://static.tildacdn.com/tila6639-3439-4539-b934-316335373361/vaza-vlnky.webp')
) v(name, uid, price, img)
where not exists (select 1 from product_stickers s where s.tilda_uid = v.uid);

insert into product_cards (product_id, status, images, description, highlights, care_steps)
select s.id, 'ready', jsonb_build_array(s.image_url), v.descr, v.hl::jsonb,
       '["Vázu myjte teplou vodou s kapkou saponátu, rýhy projeďte měkkým kartáčkem", "Vodu měňte každý den nebo obden, květiny vydrží déle", "Nedávejte ji do myčky na vysoké teploty, sklo by mohlo zmatnět", "Proti vodnímu kameni pomůže voda s trochou octa"]'::jsonb
from product_stickers s
join (values
  ('944949807374', 'Váza z čirého skla s jemným rýhováním a zúženým hrdlem. Úzký pas drží stonky pohromadě, takže i menší kytice stojí rovně.',
   '[{"title": "Výška 20 cm", "text": "pro menší kytice a kratší stonky"}, {"title": "Úzký pas", "text": "drží stonky pohromadě"}, {"title": "Čiré sklo", "text": "rýhy krásně lámou světlo"}]'),
  ('133595324234', 'Štíhlý skleněný válec se strukturou plástve. Světlo se v ní láme do drobných odlesků a stonky ve vodě jsou jen jemně vidět.',
   '[{"title": "24 × Ø 7 cm", "text": "pro pár stonků nebo jednu větev"}, {"title": "Plástev", "text": "struktura skryje stonky ve vodě"}, {"title": "Štíhlá", "text": "vejde se na okno i poličku"}]'),
  ('304053785714', 'Vyšší skleněný válec se svislými vlnkami, které připomínají tekoucí vodu. Širší hrdlo pojme i plnější kytici.',
   '[{"title": "26 × Ø 9 cm", "text": "pro kytice střední velikosti"}, {"title": "Stabilní", "text": "vysoké stonky drží rovně"}, {"title": "Vlnky", "text": "sklo vypadá jako tekoucí voda"}]')
) v(uid, descr, hl) on v.uid = s.tilda_uid
on conflict (product_id) do nothing;
