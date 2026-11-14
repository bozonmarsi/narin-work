-- New spray roses Yo (650 Kc / 10) and Haley (600 Kc / 10), modelled on
-- "Ruze Bombastik spray". Tilda products already exist:
--   Ruze yo (spray)    uid 518256140524
--   Ruze haley (spray) uid 653555913234
-- Stickers (blue ribbon) and card photos (vase) are on the Tilda CDN.
-- Also archives "Ruze mama (spray)" (owner: remove) and the old empty
-- "Ruze Haley" row that has no Tilda product and no photo.

with src as (select * from product_stickers where product_name = 'Růže Bombastik spray'),
ins as (
  insert into product_stickers (product_name, unit, color, price, height, archived, category, fragrant, quantity,
    image_url, tilda_uid, material_type, special_order, added_to_tilda, force_tomorrow, pending_review,
    manually_hidden, order_unit_size, auto_special_order, default_vase_life_days, price_markup_multiplier)
  select v.name, src.unit, v.color, v.price, src.height, false, src.category, src.fragrant, 0,
    v.img, v.uid, src.material_type, false, true, false, false,
    false, 10, false, src.default_vase_life_days, src.price_markup_multiplier
  from src, (values
    ('Růže yo (spray)',    array['Růžová','Fialová'], 650, 'https://static.tildacdn.com/tila3130-3637-4562-a436-303265643862/narin-yo-sticker.webp',    '518256140524'),
    ('Růže haley (spray)', array['Růžová','Bílá'],    600, 'https://static.tildacdn.com/tila3362-3962-4137-b539-666566646130/narin-haley-sticker.webp', '653555913234')
  ) as v(name, color, price, img, uid)
  where not exists (select 1 from product_stickers p where p.product_name = v.name)
  returning id, product_name
)
insert into product_cards (product_id, status, genus, role, tool, description, care_steps, extra_sections,
  vase_life_min, vase_life_max, vase_life_note, water_text, water_level, cut_text, height_text, height_note,
  scent_text, scent_level, pet_text, pet_note, important_note, vase_life_level, source, highlights, images, tone, extra_images)
select ins.id, c.status, c.genus, c.role, c.tool,
  case when ins.product_name like 'Růže yo%'
    then 'Sytě fuchsiová kustová růže s plnými, sametovými květy. Na jednom stonku je několik květů a poupat, takže kytice působí bohatě a objemně. Výrazná barva, která v kytici okamžitě upoutá pozornost.'
    else 'Jemná světle růžová kustová růže se smetanovými okraji okvětních lístků. Na jednom stonku je několik květů a poupat, takže kytice působí vzdušně a romanticky. Skvěle se hodí do kytic i samostatných vazeb.' end,
  c.care_steps, c.extra_sections, c.vase_life_min, c.vase_life_max, c.vase_life_note, c.water_text, c.water_level,
  c.cut_text, c.height_text, c.height_note, c.scent_text, c.scent_level, c.pet_text, c.pet_note, c.important_note,
  c.vase_life_level, 'owner',
  case when ins.product_name like 'Růže yo%'
    then '[{"title":"Víc růží na stonku","text":"několik plných květů na jednom stonku"},{"title":"Výrazná barva","text":"sytá fuchsiová, která v kytici vynikne"},{"title":"Jemná vůně","text":"nepřebije ostatní květiny"}]'::jsonb
    else '[{"title":"Víc růží na stonku","text":"několik plných květů na jednom stonku"},{"title":"Romantický odstín","text":"světle růžová se smetanovými okraji"},{"title":"Jemná vůně","text":"nepřebije ostatní květiny"}]'::jsonb end,
  case when ins.product_name like 'Růže yo%'
    then '["https://static.tildacdn.com/tila3465-3539-4039-b162-643333323138/narin-yo-vase.webp"]'::jsonb
    else '["https://static.tildacdn.com/tila6334-3732-4237-b439-376530366561/narin-haley-vase.webp"]'::jsonb end,
  case when ins.product_name like 'Růže yo%' then 'bright' else 'pastel' end,
  '[]'::jsonb
from ins, product_cards c join product_stickers s on s.id = c.product_id
where s.product_name = 'Růže Bombastik spray';

update product_stickers set archived = true
where product_name in ('Růže mama (spray)', 'Růže Haley');

select product_name, price, order_unit_size, archived, tilda_uid from product_stickers
where product_name ilike any (array['Růže yo%','Růže haley%','Růže mama%','Růže Haley']);
