-- Iris (new), Amarylis bily (new), Ranunculus peach (new); fixes for Ranunculus bily / ruzovy and Amarylis ferrari.
-- Tilda texts were already updated by the assistant. Names must equal the Tilda titles.

insert into flower_genus (key, label, pattern, role, tool, low_vase, sort, highlights)
values ('iris', 'Iris', '^iris', 'accent', 'scissors', false, 300,
  $q$[{"title": "Otevírá se postupně", "text": "každý květ rozkvete v jiný den"}, {"title": "Odkvetlé odstraňte", "text": "uvolní místo dalším poupatům"}, {"title": "Dál od ovoce", "text": "zralé ovoce urychluje vadnutí"}]$q$::jsonb)
on conflict (key) do nothing;

-- the sticker called "Ranunculus bily" pointed at the Tilda product "Ranunculus peach" by mistake:
-- it is the WHITE ranunculus (its Van Vliet name is "Ranon (it) white"), so move it to the white Tilda product.
update product_stickers set product_name = 'Ranunculus bílý', tilda_uid = '382601657034', price = 1100, color = array['Bílá']
 where id = '15e71da9-950b-4952-bd97-4262030304ba';
update product_stickers set color = array['Růžová'], flower_type = array['Ranunkulus']
 where id = '57aae920-54e6-4c54-af04-8ce494b45e28';

insert into product_stickers (product_name, unit, color, price, height, archived, category, fragrant, image_url, tilda_uid, material_type, added_to_tilda, order_unit_size, flower_type)
values
 ('Iris fialový',    'стебель', array['Fialová'],            430,  'Vysoké', false, 'ohapka', false, $q$https://static.tildacdn.com/stor3032-3730-4338-b937-343036363735/4ce2089a9d4e7ac3eb75aca1bdda4a67.webp$q$,  '973113899404', 'flower', true, 20, null),
 ('Amarylis bílý',   null,      array['Bílá'],               380,  'Vysoké', false, 'ohapka', false, $q$https://static.tildacdn.com/stor3762-6463-4163-b336-373463663865/e9235f88d80d8321493e57af4a197e01.webp$q$,  '559775130864', null,     true, 3,  null),
 ('Ranunculus peach','стебель', array['Růžová','Bílá'],      1020, null,     false, 'ohapka', false, $q$https://static.tildacdn.com/stor6333-3565-4738-a464-633837626630/1f9c095b1e8ad2217438b6bff41b7e33.jpg$q$, '665941409814', 'flower', true, 10, array['Ranunkulus'])
on conflict (product_name) do nothing;

insert into product_cards (product_id, status, genus, role, tool, tone, description, care_steps, extra_sections, vase_life_min, vase_life_max, vase_life_note, vase_life_level,
  water_text, water_level, cut_text, height_text, height_note, scent_text, scent_level, pet_text, pet_note, important_note, source, images, extra_images)
select id, 'ready', $q$iris$q$, $q$accent$q$, $q$scissors$q$, $q$deep$q$, $q$Sytě fialové kosatce (iris) se zvlněnými lístky a výraznou zlatožlutou skvrnou uprostřed. Štíhlé, vzpřímené stonky a květy, které se otevírají postupně jeden po druhém, dodají kytici barvu i lehkost. Krásně vypadají samostatně v úzké vysoké váze i jako sytý akcent v jarních a letních vazbách.$q$, $q$["Postavte ihned do čisté vázy s chladnou vodou (18–22 °C)", "Vodu vyměňujte každé 1–2 dny a vždy důkladně umyjte vázu", "Každé 2 dny seřízněte stonek šikmo o 1–2 cm", "Odstraňte spodní listy, které by byly ponořené ve vodě", "Odkvetlé květy průběžně odstraňujte – uvolní místo dalším poupatům", "Chraňte před přímým sluncem, topením a zralým ovocem, které urychluje vadnutí", "Ideální teplota: 15–20 °C"]$q$::jsonb, '[]'::jsonb, 6, 9, $q$Květy se otevírají postupně jeden po druhém, v chladu vydrží déle$q$, 2,
  $q$2/3 délky stonku$q$, 2, $q$Šikmý řez$q$, $q$50–60 cm$q$, $q$Přibližná výška, může se mírně lišit podle podmínek$q$, $q$Jemná, svěží$q$, 1, $q$Toxický$q$, $q$Držte mimo dosah koček a psů.$q$, null, 'owner', $q$["https://static.tildacdn.com/stor3032-3730-4338-b937-343036363735/4ce2089a9d4e7ac3eb75aca1bdda4a67.webp"]$q$::jsonb, '[]'::jsonb
from product_stickers where product_name = $q$Iris fialový$q$
on conflict (product_id) do nothing;

insert into product_cards (product_id, status, genus, role, tool, tone, description, care_steps, extra_sections, vase_life_min, vase_life_max, vase_life_note, vase_life_level,
  water_text, water_level, cut_text, height_text, height_note, scent_text, scent_level, pet_text, pet_note, important_note, source, images, extra_images)
select id, 'ready', $q$amarylis$q$, $q$accent$q$, $q$scissors$q$, $q$neutral$q$, $q$Velkolepá řezaná amarylis s obrovskými, čistě bílými květy trumpetovitého tvaru a jemně nazelenalým středem. Na silném, dutém stonku sedí po dvou až čtyřech květech, které se otevírají postupně. Působí slavnostně a čistě – oblíbená v zimních a vánočních kompozicích, ve svatebních vazbách i jako jediný stonek ve vysoké váze.$q$, $q$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte rovně a nalijte do vázy jen menší množství vody, zhruba 10 cm", "Dutý stonek můžete podepřít tenkou tyčinkou nebo ho naplnit vodou a zacpat vatou", "Vodu vyměňujte každé 2–3 dny a vázu vždy důkladně umyjte", "Stonek se rád stáčí za světlem, proto vázu občas otočte", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Ideální teplota: 15–20 °C"]$q$::jsonb, '[]'::jsonb, 10, 14, $q$Květy se postupně otevírají, vydrží déle v chladu$q$, null,
  $q$10 cm vody$q$, 1, $q$Rovný nebo mírně šikmý řez$q$, $q$50–70 cm$q$, $q$Přibližná výška, může se mírně lišit podle podmínek$q$, $q$Prakticky bez vůně$q$, 1, $q$Jedovaté$q$, $q$Cibule i stonek obsahují toxické látky, umístěte mimo dosah koček a psů$q$, $q$Může být dodáno bez krabice.$q$, 'owner', $q$["https://static.tildacdn.com/stor3762-6463-4163-b336-373463663865/e9235f88d80d8321493e57af4a197e01.webp"]$q$::jsonb, '[]'::jsonb
from product_stickers where product_name = $q$Amarylis bílý$q$
on conflict (product_id) do nothing;

insert into product_cards (product_id, status, genus, role, tool, tone, description, care_steps, extra_sections, vase_life_min, vase_life_max, vase_life_note, vase_life_level,
  water_text, water_level, cut_text, height_text, height_note, scent_text, scent_level, pet_text, pet_note, important_note, source, images, extra_images)
select id, 'ready', $q$ranunculus$q$, $q$focal$q$, $q$scissors$q$, $q$pastel$q$, $q$Něžné ranunculus v broskvovo-krémových odstínech s jemně zelenavým středem. Husté, vrstvené, papírovité plátky tvoří květy podobné malým pivoňkám. Teplé pastelové tóny ladí se svatebními, romantickými i podzimními vazbami – dodají objem a měkkou barvu.$q$, $q$["Nalijte jen 5–7 cm vlažné vody – duté stonky ve vysoké vodě měknou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo o 1–2 cm (stonky jsou tenké a křehké)", "Odstraňte listy, které by byly ponořené ve vodě", "Chraňte před přímým sluncem, topením a teplotami nad 22 °C – v chladu vydrží nejdéle", "Květy se otevírají pomalu, plně rozkvetou za 1–3 dny; nejdéle vydrží řezané v barevném pupenu"]$q$::jsonb, '[]'::jsonb, 14, 18, $q$Patří mezi stálé řezané květiny s dobrou výdrží.$q$, 3,
  $q$5–7 cm vody$q$, 1, $q$Šikmý řez na 45 stupňů$q$, $q$45–50 cm$q$, $q$Přibližná výška, může se mírně lišit podle podmínek$q$, $q$Jemná$q$, 1, $q$Mírně toxický při pozření$q$, $q$Obsahuje ranunkulin a další toxické látky. Držte mimo dosah koček a psů.$q$, null, 'owner', $q$["https://static.tildacdn.com/stor6333-3565-4738-a464-633837626630/1f9c095b1e8ad2217438b6bff41b7e33.jpg", "https://static.tildacdn.com/stor3738-6361-4133-b032-623430643133/94cc5afaba5f0cba8b00d32278f6667d.png"]$q$::jsonb, '[]'::jsonb
from product_stickers where product_name = $q$Ranunculus peach$q$
on conflict (product_id) do nothing;

update product_cards set description = $q$Čistě bílé ranunculus s hustými, jemně vrstvenými plátky, které připomínají papír. Plné květy se světle zeleným středem působí svěže a romanticky – jako malé pivoňky. Skvěle se hodí do svatebních, jemných i minimalistických vazeb, kde dodají objem a světlo.$q$, care_steps = $q$["Nalijte jen 5–7 cm vlažné vody – duté stonky ve vysoké vodě měknou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo o 1–2 cm (stonky jsou tenké a křehké)", "Odstraňte listy, které by byly ponořené ve vodě", "Chraňte před přímým sluncem, topením a teplotami nad 22 °C – v chladu vydrží nejdéle", "Květy se otevírají pomalu, plně rozkvetou za 1–3 dny; nejdéle vydrží řezané v barevném pupenu"]$q$::jsonb, water_text = '5–7 cm vody', water_level = 1, genus = 'ranunculus', role = 'focal', tool = 'scissors',
  scent_text = $q$Jemná$q$, images = $q$["https://static.tildacdn.com/stor3839-6430-4034-b662-646131363332/8bf120d1d9720bf78b26139a285daa85.webp"]$q$::jsonb, updated_at = now()
 where product_id = '15e71da9-950b-4952-bd97-4262030304ba';

update product_cards set description = $q$Jemný ranunculus s plnými, vrstvenými květy v čistém růžovém odstínu. Papírovité plátky tvoří bohaté květy podobné malým pivoňkám, mezi nimiž vykukují i drobná poupata. Skvěle se hodí do romantických, svatebních i jarních vazeb – dodává objem a něžnou barvu.$q$, care_steps = $q$["Nalijte jen 5–7 cm vlažné vody – duté stonky ve vysoké vodě měknou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo o 1–2 cm (stonky jsou tenké a křehké)", "Odstraňte listy, které by byly ponořené ve vodě", "Chraňte před přímým sluncem, topením a teplotami nad 22 °C – v chladu vydrží nejdéle", "Květy se otevírají pomalu, plně rozkvetou za 1–3 dny; nejdéle vydrží řezané v barevném pupenu"]$q$::jsonb, water_text = '5–7 cm vody', water_level = 1, genus = 'ranunculus', role = 'focal', tool = 'scissors',
  scent_text = $q$Slabá až neutrální$q$, updated_at = now()
 where product_id = '57aae920-54e6-4c54-af04-8ce494b45e28';

update product_cards set description = $q$Velkolepá řezaná amarylis se sytě červenými, sametovými květy trumpetovitého tvaru, které sedí po dvou až čtyřech na silném, dutém stonku. Působí luxusně, slavnostně a dramaticky, proto je oblíbená v zimních a vánočních kompozicích, v moderních vázách i v dárkových vazbách. I jediný stonek dokáže být samostatným centrem pozornosti.$q$, updated_at = now() where product_id = '1cf06b55-18da-4043-a217-afd50aab9165';

select s.product_name, s.price, s.tilda_uid, s.color, (c.product_id is not null) has_card, c.genus
  from product_stickers s left join product_cards c on c.product_id = s.id
 where s.product_name ilike any (array['Iris%','Amarylis%','Ranunculus%']) order by 1;
