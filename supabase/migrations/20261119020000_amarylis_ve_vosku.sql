-- Amarylis ve vosku: категория Vánoce, 510 Kč, «под заказ» (special_order): сайт сам пишет
-- ближайшую дату («Doručíme 21. 11.» если заказать в четверг) и на оформлении нельзя выбрать раньше.
insert into product_stickers (product_name, image_url, tilda_uid, tilda_url, category, price, quantity, order_unit_size, added_to_tilda, manually_hidden, special_order)
select 'Amarylis ve vosku', 'https://static.tildacdn.com/tila3131-6264-4537-a434-306663353533/amarylis-ve-vosku.webp', '612327651384',
       'https://vezminarin.cz/tproduct/612327651384', 'vanoce', 510, 0, 1, true, false, true
where not exists (select 1 from product_stickers where tilda_uid = '612327651384');

-- Карточка для окна товара: свои советы и уход (иначе подтянулись бы советы для срезанного амариллиса в вазе).
insert into product_cards (product_id, status, images, description, highlights, care_steps)
select ps.id, 'ready',
       '["https://static.tildacdn.com/tila3131-6264-4537-a434-306663353533/amarylis-ve-vosku.webp"]'::jsonb,
       'Cibule amarylisu zalitá ve vosku s jemným třpytem. Nepotřebuje hlínu ani zalévání a za několik týdnů vykvete.',
       '[{"title": "Bez zalévání", "text": "voda ani hlína nejsou potřeba"},
         {"title": "Kvete sama", "text": "za několik týdnů vyroste velký květ"},
         {"title": "Na světlo", "text": "stranou od topení vydrží déle"}]'::jsonb,
       '["Postavte ji na světlé místo, ale ne na přímé slunce", "Nezalévejte, vosk chrání cibuli a ta má v sobě vše potřebné", "Držte ji stranou od topení", "Když květ ztěžkne, otočte ji občas ke světlu, ať roste rovně"]'::jsonb
from product_stickers ps
where ps.tilda_uid = '612327651384'
on conflict (product_id) do nothing;
