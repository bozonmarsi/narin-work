-- Product cards v3 (2026-10-30)
-- 1. Fills the three draft cards and fixes gaps (heights, scent, water text, junk sections).
-- 2. Rewrites the "Důležité vědět" tips: 3 short, practical, flower-specific tips per genus.
-- 3. Recommendations v3: colour + tone (pastel/bright/deep/neutral) + role recipe + pins/blocks + purchase stats,
--    tunable in rec_settings, precomputed into product_recs (refreshed by triggers and nightly cron).
-- 4. get_product_card_bundle(): every card + recommendations in one cached response, so the popup opens instantly.
-- Safe to run twice.

-- ---------------------------------------------------------------- 1. content
update product_cards pc set
  status = 'ready', source = 'claude',
  description = 'Sytě fialová eustoma s jemnými, vrstvenými okvětními lístky, které připomínají malé růže. Dodá kytici hloubku a eleganci a krásně ladí s bílou, růžovou i zelenou. Poupata se doma postupně otevírají, takže vydrží dlouho.',
  care_steps = '["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)","Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu","Každé 2–3 dny seřízněte stonek šikmo pod vodou (úhel 45°)","Odstraňte spodní listy, které by byly ponořené ve vodě","Odkvetlé květy odstraňte, poupata se pak otevřou rychleji","Chraňte před přímým sluncem a teplotami nad 22 °C (ideálně 15–20 °C)"]'::jsonb,
  vase_life_min = 10, vase_life_max = 15, vase_life_level = 3, vase_life_note = 'Patří mezi stálé řezané květiny s dobrou výdrží.',
  water_text = '1/3 délky stonku', water_level = 1,
  cut_text = 'Šikmý řez na 45 stupňů + rozštěpení konce stonku',
  height_text = '45–50 cm', height_note = 'Přibližná výška, může se mírně lišit podle podmínek',
  scent_text = 'Velmi jemná, lehce sladká', scent_level = 1,
  pet_text = 'Mírně toxický při pozření', pet_note = 'Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.'
from product_stickers ps
where ps.id = pc.product_id and decode_html_entities(ps.product_name) = 'Eustoma fialová' and pc.status = 'draft';

update product_cards pc set
  status = 'ready', source = 'claude',
  description = 'Karafiát v hluboké vínové barvě s plnými, krajkovými květy na pevném stonku. Dodá kytici luxusní tmavý akcent a krásně vynikne vedle bílé, růžové i zelené. Patří k nejtrvanlivějším řezaným květinám – ve váze vydrží 2–3 týdny.',
  care_steps = '["Postavte ihned do čisté vázy s vlažnou vodou","Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu (karafiáty jsou citlivé na bakterie)","Každé 2–3 dny seřízněte stonek šikmo o 2–3 cm, vždy mezi kolínky","Odstraňte listy, které jsou ponořené ve vodě","Chraňte před přímým sluncem, průvanem a zrajícím ovocem (nejlépe 15–20 °C)"]'::jsonb
from product_stickers ps
where ps.id = pc.product_id and decode_html_entities(ps.product_name) = 'Karafiát burgundi' and pc.status = 'draft';

update product_cards pc set
  status = 'ready', source = 'claude',
  description = 'Růžové lilie s velkými hvězdicovitými květy a výraznou sladkou vůní. Na jednom stonku je několik poupat, která se otevírají postupně, takže je kytice doma každý den jiná. Skvělá samostatně i jako dominanta velké kytice.',
  care_steps = '["Postavte ihned do čisté vázy se studenou vodou","Vyměňujte vodu každé 2 dny a seřízněte stonek šikmo o 1–2 cm","Odstraňte listy, které by byly pod vodou","Jakmile se květ otevře, opatrně vytrhněte tyčinky s pylem – pyl barví látky i ubrus","Odkvetlé květy ulomte, ostatní poupata se pak otevřou rychleji","Chraňte před přímým sluncem a zrajícím ovocem (ideálně 15–20 °C)"]'::jsonb,
  vase_life_min = 10, vase_life_max = 14, vase_life_level = 2, vase_life_note = 'Poupata se otevírají postupně, kytice tak vydrží dlouho.',
  water_text = '1/3 délky stonku', water_level = 1,
  cut_text = 'Šikmý řez na 45 stupňů',
  height_text = '60–80 cm', height_note = 'Přibližná výška, může se mírně lišit podle podmínek',
  scent_text = 'Výrazná, sladká, květinová', scent_level = 3,
  pet_text = 'Velmi jedovatá pro kočky',
  pet_note = 'Pro kočky je nebezpečná celá rostlina i voda z vázy. Do domácnosti s kočkou ji nedoporučujeme.'
from product_stickers ps
where ps.id = pc.product_id and decode_html_entities(ps.product_name) = 'Lilie růžová mix' and pc.status = 'draft';

-- gaps and errors in existing cards
update product_cards pc set scent_text = 'Intenzivní, sladká, citrusově-květinová', scent_level = 3
from product_stickers ps where ps.id = pc.product_id and decode_html_entities(ps.product_name) = 'Freesia bilá' and pc.scent_level is null;
update product_cards pc set height_text = '45–50 cm'
from product_stickers ps where ps.id = pc.product_id and decode_html_entities(ps.product_name) = 'Fressia červená' and pc.height_text = '10-14';
update product_cards pc set height_text = '50–60 cm', height_note = coalesce(pc.height_note, 'Přibližná výška, může se mírně lišit podle podmínek')
from product_stickers ps where ps.id = pc.product_id and decode_html_entities(ps.product_name) in ('Anturium', 'Růže pink express') and pc.height_text is null;
update product_cards pc set height_text = '45–50 cm', height_note = coalesce(pc.height_note, 'Přibližná výška, může se mírně lišit podle podmínek')
from product_stickers ps where ps.id = pc.product_id and decode_html_entities(ps.product_name) = 'Tulipan bilý' and pc.height_text is null;
update product_cards pc set water_text = '10 cm vody', water_level = 1
from product_stickers ps where ps.id = pc.product_id and decode_html_entities(ps.product_name) = 'Amarylis ferrari' and length(pc.water_text) > 30;
-- broken fragments left over from the Tilda import
update product_cards set extra_sections = '[]'::jsonb
where extra_sections::text ~ 'nbsp;|vázy se"';

-- sets: the composition was stored as care steps; it becomes its own "Složení" section
update product_cards pc set extra_sections = jsonb_build_array(jsonb_build_object('title', 'Složení', 'items', v.items::jsonb)),
       care_steps = '[]'::jsonb, description = coalesce(v.descr, pc.description), important_note = coalesce(v.note, pc.important_note)
from product_stickers ps, (values
 ('SET Jarní', '["10 ks korálových pivoněk Coral Charm","25 ks bílých sedmikrásek (Tanacetum)","10 ks bílých matthiol"]',
   'Romantický, jemný a velmi vzdušný set v korálově-bílé paletě. Kombinace velkých nadýchaných pivoněk, klasických sedmikrásek a voňavých bílých matthiol vytváří kompozici plnou něhy, svěžesti a jemné elegance. Působí jako jarní nebo raně letní sen — lehký, romantický a zároveň luxusní.', null),
 ('SET Slunečný', '["10 ks slunečnic","10 ks karafiátů Kiwi","4 ks Leucospermum (zlaté jehelníčky)"]',
   'Jasný, veselý a energický set plný slunce. Velké žluté slunečnice, svěže zelené karafiáty Kiwi a zlaté jehelníčky Leucospermum vytvářejí kompozici, která vypadá jako letní louka zachycená ve váze — živá, optimistická a plná života.', null),
 ('SET Bilý', '["10 ks bílých kal","10 ks bílých eustom","10 ks bílých heřmánků"]', null, null),
 ('SET Květnový', '["10 ks světle fialových matthiol","10 ks růžových pivoněk Sarah Bernhardt","10 ks růžovo-fialových kal Zazu"]', null, null),
 ('SET kafka', '["10 ks lososových růží Priscilla","10 ks vínového amarantu Rosary","10 ks zeleného hyperica"]',
   'Kafka je komplet ze tří samostatných náručí, každé po deseti stoncích: lososové růže Priscilla, vínový amarant Rosary s převislými střapci a zelené hypericum se svěžími bobulemi. Teplý podzim bez zbytečného patosu. Paleta lososová, vínová a zelená působí měkce, útulně a přitom moderně. Každou květinu můžete dát do vlastní vázy, nebo je spojit do jedné bohaté kytice.',
   'Může být dodáno bez krabice.')
) as v(n, items, descr, note)
where ps.id = pc.product_id and decode_html_entities(ps.product_name) = v.n
  and (jsonb_array_length(coalesce(pc.care_steps, '[]'::jsonb)) > 0 or pc.description like '%Složení →%');

update product_cards set description = replace(replace(description, 'kustové gvozdíky', 'keříkové karafiáty'), 'gvozdíky', 'karafiáty')
where description like '%gvozdík%';

-- ---------------------------------------------------------------- 2. tips (Důležité vědět)
update flower_genus g set highlights = v.h::jsonb from (values
 ('pivonka',     '[{"title":"Přijde v poupěti","text":"rozkvete doma za 2–4 dny, v teple rychleji"},{"title":"Chcete ji zpomalit?","text":"na noc ji dejte do chladu, vydrží déle"},{"title":"Lepkavé poupě je v pořádku","text":"je to nektar, ne škůdce"}]'),
 ('ruze',        '[{"title":"Ohnutá hlava?","text":"seřízněte stonek a dejte ji na hodinu do hluboké vody"},{"title":"Listy pod vodou pryč","text":"voda zůstane déle čistá"},{"title":"Vnější lístky klidně odtrhněte","text":"chránily květ cestou, není to vada"}]'),
 ('hortenzie',   '[{"title":"Pije i květem","text":"povadlou ponořte celou na 30 minut do studené vody"},{"title":"Váza skoro plná","text":"hortenzie vypije hodně, dolévejte denně"},{"title":"Dá se usušit","text":"nechte ji ve váze vyschnout, barva zůstane"}]'),
 ('dahlia',      '[{"title":"Krásná hned teď","text":"přijde rozkvetlá, v plné kráse 5–7 dní"},{"title":"Čerstvá voda každý den","text":"jiřiny nesnášejí zakalenou vodu"},{"title":"Na noc do chladu","text":"v teple květy rychleji opadávají"}]'),
 ('gerbera',     '[{"title":"Jen 5 cm vody","text":"ve vysoké vodě stonek měkne a hnije"},{"title":"Ohnutá hlava?","text":"na pár hodin ji vzpřímeně zabalte do papíru"},{"title":"Úzká váza","text":"udrží těžké hlavy rovně"}]'),
 ('karafiat',    '[{"title":"Vydrží 2–3 týdny","text":"jedna z nejtrvanlivějších řezaných květin"},{"title":"Řežte mezi kolínky","text":"přes kolínko stonek vodu nenasaje"},{"title":"Mimo ovoce","text":"zrající ovoce vedle vázy zkracuje život květů"}]'),
 ('tulipan',     '[{"title":"Ve váze ještě rostou","text":"za den povyrostou a otočí se za světlem"},{"title":"Málo studené vody","text":"stačí 5–10 cm, dolévejte často"},{"title":"Chcete rovné stonky?","text":"zabalte je na 2 hodiny do papíru a dejte do vody"}]'),
 ('ranunculus',  '[{"title":"Jen 5–7 cm vody","text":"duté stonky ve vysoké vodě měknou"},{"title":"Otevírá se pomalu","text":"plně rozkvete za 1–3 dny"},{"title":"V chladu až 2 týdny","text":"mimo slunce a topení vydrží nejdéle"}]'),
 ('lilie',       '[{"title":"Pyl barví","text":"tyčinky opatrně vytrhněte hned po rozkvětu"},{"title":"Nebezpečná pro kočky","text":"i pyl a voda z vázy, držte mimo dosah"},{"title":"Kvete postupně","text":"odkvetlé květy ulomte, otevřou se další"}]'),
 ('slunecnice',  '[{"title":"Těžká hlava","text":"potřebuje vysokou a stabilní vázu"},{"title":"Hodně pije","text":"dolévejte vodu každý den"},{"title":"Spodní listy pryč","text":"květ pak dostane víc vody"}]'),
 ('chryzantema', '[{"title":"Vydrží 2–3 týdny","text":"jedna z nejodolnějších květin"},{"title":"Listy pod vodou pryč","text":"ve vodě rychle hnijí a kalí ji"},{"title":"Má ráda chlad","text":"v chladnějším pokoji vydrží nejdéle"}]'),
 ('eustoma',     '[{"title":"Poupata se otevřou","text":"kytice je doma každý den plnější"},{"title":"Odkvetlé květy pryč","text":"ostatní poupata dostanou víc síly"},{"title":"Mimo průvan","text":"jemné okvětí se snadno pomačká"}]'),
 ('freesia',     '[{"title":"Kvete postupně","text":"odkvetlé kvítky otrhejte, otevřou se další"},{"title":"Voní nejvíc v teple","text":"v chladu je vůně slabší"},{"title":"Mimo ovoce","text":"frézie jsou citlivé na zrající ovoce"}]'),
 ('matthiola',   '[{"title":"Nejvíc voní večer","text":"sladká vůně provoní celou místnost"},{"title":"Vodu měňte denně","text":"měkký stonek ji rychle kalí"},{"title":"Listy pod vodou pryč","text":"jinak voda začne zapáchat"}]'),
 ('hermanek',    '[{"title":"Zaplní mezery","text":"stačí pár stonků mezi velké květy"},{"title":"Bylinná vůně","text":"při doteku je výraznější"},{"title":"Vydrží až 12 dní","text":"když mu měníte vodu každé 2 dny"}]'),
 ('eukalyptus',  '[{"title":"Voní při doteku","text":"uvolní svěží mátovou vůni"},{"title":"Vydrží týdny","text":"a dá se nechat uschnout"},{"title":"Rozštěpte stonek","text":"dřevnatý stonek pak lépe pije"}]'),
 ('moluccella',  '[{"title":"Zelené zvonky","text":"jsou to kalichy, drobné květy jsou uvnitř"},{"title":"Dává kytici výšku","text":"dejte ji dozadu jako páteř"},{"title":"Usušená vydrží měsíce","text":"zezlátne do krémové barvy"}]'),
 ('eryngium',    '[{"title":"Modrý bodlák","text":"vydrží až 2,5 týdne"},{"title":"Pozor, píchá","text":"berte ho za stonek"},{"title":"Dá se usušit","text":"modrá barva zůstane"}]'),
 ('leucadendron','[{"title":"Vydrží 2–3 týdny","text":"jedna z nejtrvanlivějších rostlin"},{"title":"Barvu dávají listeny","text":"ne květy, proto nevadnou"},{"title":"Skoro bez péče","text":"stačí čistá voda jednou za 2–3 dny"}]'),
 ('kala',        '[{"title":"Stačí pár stonků","text":"nejvíc vynikne v úzké vysoké váze"},{"title":"Málo vody","text":"5–10 cm, stonek jinak měkne"},{"title":"Otáčí se za světlem","text":"chcete rovné stonky? Pootočte vázu"}]'),
 ('allium',      '[{"title":"Okrasný česnek","text":"stonek může jemně vonět cibulí"},{"title":"Vydrží 2 týdny","text":"a hlava je krásná i suchá"},{"title":"Vodu měňte často","text":"cibulová vůně pak nevznikne"}]'),
 ('delphinium',  '[{"title":"Dodá kytici výšku","text":"vysoký klas vynikne vzadu"},{"title":"Opadávají lístky?","text":"to je přirozené, zkraťte stonek a vyměňte vodu"},{"title":"Jedovatá rostlina","text":"mimo dosah dětí a zvířat"}]'),
 ('hyacint',     '[{"title":"Silná vůně","text":"jeden stonek provoní celý pokoj"},{"title":"Roste i ve váze","text":"stonek se ještě prodlouží"},{"title":"Míza dráždí","text":"po zastřihnutí si umyjte ruce"}]'),
 ('anturium',    '[{"title":"Vydrží 2–3 týdny","text":"potřebuje teplo nad 15 °C"},{"title":"Lesklé srdce je list","text":"pravé květy sedí na klasu"},{"title":"Nejlíp samotné","text":"3–5 stonků v úzké vysoké váze"}]'),
 ('amarylis',    '[{"title":"Dutý stonek","text":"podepřete ho úzkou vysokou vázou"},{"title":"Kvete postupně","text":"každý květ se otevře jindy"},{"title":"Jen 10 cm vody","text":"ve vysoké vodě stonek praská a stáčí se"}]'),
 ('leucospermum','[{"title":"Jehelníček z Afriky","text":"vydrží kolem dvou týdnů"},{"title":"Skoro bez péče","text":"stačí čistá voda každé 2–3 dny"},{"title":"Dá se usušit","text":"tvar i barva zůstanou"}]'),
 ('protea',      '[{"title":"Královna exotiky","text":"vydrží až 3 týdny"},{"title":"Dá se usušit","text":"zůstane krásná i po uschnutí"},{"title":"Velká hlava","text":"potřebuje těžkou stabilní vázu"}]'),
 ('magnolie',    '[{"title":"Kvete na větvi","text":"poupata se otevírají postupně"},{"title":"Rozštěpte konec větve","text":"dřevnatý stonek pak lépe pije"},{"title":"Hodně vody","text":"dolévejte každý den"}]'),
 ('nerine',      '[{"title":"Vydrží 2 týdny","text":"jedna z nejtrvanlivějších cibulovin"},{"title":"Kvete postupně","text":"kvítky se otevírají jeden po druhém"},{"title":"Málo vody","text":"stačí 10 cm"}]')
) as v(k, h) where g.key = v.k;

-- variety-specific tips (override the genus ones)
update product_cards pc set highlights = v.h::jsonb from product_stickers ps, (values
 ('Pivoňka Sarah Bernard', '[{"title":"Přijde v poupěti","text":"rozkvete doma za 2–4 dny, v teple rychleji"},{"title":"Nejplnější odrůda","text":"kulatá hlava a sladká vůně, stačí pár stonků"},{"title":"Chcete ji zpomalit?","text":"na noc ji dejte do chladu, vydrží déle"}]'),
 ('Pivoňka Coral Charm',   '[{"title":"Mění barvu","text":"z korálové postupně zesvětlí do meruňkové"},{"title":"Přijde v poupěti","text":"rozkvete doma za 2–4 dny"},{"title":"Chcete ji zpomalit?","text":"na noc ji dejte do chladu"}]'),
 ('Kala picasso',          '[{"title":"Každý květ jiný","text":"bílý okraj, fialový střed"},{"title":"Málo vody","text":"5–10 cm, stonek jinak měkne"},{"title":"Stačí pár stonků","text":"nejvíc vynikne v úzké vysoké váze"}]'),
 ('Karafiat Kiwi',         '[{"title":"Zelený karafiát","text":"svěží akcent, který ladí se vším"},{"title":"Vydrží 2–3 týdny","text":"jedna z nejtrvanlivějších květin"},{"title":"Řežte mezi kolínky","text":"přes kolínko stonek vodu nenasaje"}]')
) as v(n, h)
where ps.id = pc.product_id and decode_html_entities(ps.product_name) = v.n;

-- ---------------------------------------------------------------- 3. recommendations v3
-- tone of the exact shade, set by the florist; null = neutral for white/green, bright otherwise
alter table product_cards add column if not exists tone text;
alter table product_cards drop constraint if exists product_cards_tone_check;
alter table product_cards add constraint product_cards_tone_check check (tone is null or tone in ('pastel','bright','deep','neutral'));

update product_cards pc set tone = v.t from product_stickers ps, (values
 ('Eustoma fialová','deep'),('Karafiát burgundi','deep'),('Lilie růžová mix','bright'),('Allium fialový','deep'),
 ('Amarylis ferrari','deep'),('Anturium','bright'),('Chryzantéma zelená','neutral'),('Dahlia bilá','neutral'),
 ('Dahlia bordo','deep'),('Dahlia caitlins','bright'),('Dahlia queen','pastel'),('Dahlia sunny boy','bright'),
 ('Dahlia wizzard','pastel'),('Delphinium modrý','bright'),('Eryngium','neutral'),('Eukalyptus','neutral'),
 ('Eustoma bilá','neutral'),('Freesia bilá','neutral'),('Fressia červená','bright'),('Fressia žlutá','bright'),
 ('Gerbera Claudemir','bright'),('Gerbera cream springs','pastel'),('Gerbera Magic','bright'),('Gerbera Mayball','bright'),
 ('Gerbera Nola','bright'),('Gerbera Stich','bright'),('Heřmánek','neutral'),('Hortenezie bilá','neutral'),
 ('Hortenzie růžová','pastel'),('Hortenzie světle-modrá','pastel'),('Hyacint modrý','bright'),('Kala bilá','neutral'),
 ('Kala picasso','pastel'),('Kala Zazu','deep'),('Karafiát růžový','pastel'),('Karafiát bilý (spray)','neutral'),
 ('Karafiat červený (mini)','bright'),('Karafiat Kino','bright'),('Karafiat Kiwi','neutral'),('Leucadendron','deep'),
 ('Leucospermum','bright'),('Matthiola bilá','neutral'),('Matthiola růžová','pastel'),('Moluccella','neutral'),
 ('Pivoňka bilá','neutral'),('Pivoňka Coral Charm','bright'),('Pivoňka Red Charm','deep'),('Pivoňka Sarah Bernard','pastel'),
 ('Protea','pastel'),('Ranunculus bílý','neutral'),('Ranunculus růžový','pastel'),('Růže Bombastik spray','pastel'),
 ('Růže pink express','bright'),('Slunečnice','bright'),('Tulipan bilý','neutral'),('Tulipan růžový','bright')
) as v(n, t)
where ps.id = pc.product_id and decode_html_entities(ps.product_name) = v.n and pc.tone is null;

-- colour wheel v3 (only on the first run, so later edits by the florist are kept):
-- tone-on-tone and analogous colours score high, white and green are good partners but no longer win everything
do $$ begin
  if to_regclass('public.rec_settings') is null then
    insert into color_harmony (a, b, score) values
      ('Bílá','Bílá',1.2),('Bílá','Zelená',1.6),('Bílá','Růžová',1.5),('Bílá','Červená',1.5),('Bílá','Fialová',1.5),('Bílá','Modrá',1.5),('Bílá','Žlutá',1.5),
      ('Zelená','Zelená',0.6),('Zelená','Růžová',1.5),('Zelená','Červená',1.5),('Zelená','Fialová',1.5),('Zelená','Modrá',1.4),('Zelená','Žlutá',1.5),
      ('Růžová','Růžová',1.9),('Růžová','Červená',1.5),('Růžová','Fialová',1.8),('Růžová','Modrá',1.3),('Růžová','Žlutá',0.6),
      ('Červená','Červená',1.7),('Červená','Fialová',1.0),('Červená','Modrá',0.5),('Červená','Žlutá',1.3),
      ('Fialová','Fialová',1.6),('Fialová','Modrá',1.8),('Fialová','Žlutá',1.5),
      ('Modrá','Modrá',1.5),('Modrá','Žlutá',1.7),
      ('Žlutá','Žlutá',1.6)
    on conflict (a, b) do update set score = excluded.score;
  end if;
end $$;

-- how well two tones sit together (symmetric; editable)
create table if not exists public.tone_harmony (
  a text not null, b text not null, score numeric not null,
  primary key (a, b)
);
alter table public.tone_harmony enable row level security;
drop policy if exists manager_write_tone_harmony on public.tone_harmony;
create policy manager_write_tone_harmony on public.tone_harmony for all
  using (is_manager()) with check (is_manager());
insert into public.tone_harmony (a, b, score) values
  ('pastel','pastel',1.7),('pastel','neutral',1.3),('pastel','bright',0.3),('pastel','deep',0.7),
  ('bright','bright',1.4),('bright','neutral',1.2),('bright','deep',1.0),
  ('deep','deep',1.4),('deep','neutral',1.2),
  ('neutral','neutral',0.8)
on conflict (a, b) do nothing;

-- one row of tunable knobs
create table if not exists public.rec_settings (
  id int primary key default 1 check (id = 1),
  weights jsonb not null,
  role_fit jsonb not null,
  recipe jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.rec_settings enable row level security;
drop policy if exists manager_write_rec_settings on public.rec_settings;
create policy manager_write_rec_settings on public.rec_settings for all
  using (is_manager()) with check (is_manager());
insert into public.rec_settings (id, weights, role_fit, recipe) values (1,
  '{"role":1,"color":1,"tone":1.2,"stats":1,"popularity":1,"same_genus":-1.5,"height":0.4,"pin":10}',
  '{"focal":{"filler":3,"greenery":2.6,"accent":1.8,"focal":1.2},
    "filler":{"focal":3,"greenery":2,"accent":1.5,"filler":0.4},
    "greenery":{"focal":3,"filler":2.2,"accent":1.6,"greenery":0.2},
    "accent":{"focal":2.6,"greenery":2.2,"filler":2,"accent":0.6}}',
  '{"focal":{"greenery":2,"filler":3,"focal":2,"accent":2},
    "filler":{"focal":4,"greenery":2,"accent":2},
    "greenery":{"focal":4,"filler":3,"accent":2},
    "accent":{"focal":3,"greenery":2,"filler":2}}')
on conflict (id) do nothing;

-- precomputed recommendations: for every flower, the best partners per role
create table if not exists public.product_recs (
  product_id uuid not null,
  rec_id uuid not null,
  role text not null,
  score numeric not null,
  reason text not null,
  rank int not null,
  primary key (product_id, rec_id)
);
alter table public.product_recs enable row level security;

create or replace function public.refresh_product_recs() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from product_recs where true;
  insert into product_recs (product_id, rec_id, role, score, reason, rank)
  with st as (select weights w, role_fit rf, recipe rc from rec_settings where id = 1),
  prod as (
    select ps.id, ps.color, ps.height,
           coalesce(pc.role, g.role) as role, g.key as genus,
           coalesce(pc.tone, case when ps.color <@ array['Bílá','Zelená'] then 'neutral' else 'bright' end) as tone
      from product_stickers ps
      left join product_cards pc on pc.product_id = ps.id
      left join flower_genus g on g.key = coalesce(pc.genus,
           (select x.key from flower_genus x where norm_name(ps.product_name) ~ x.pattern order by x.sort limit 1))
     where ps.archived = false and not coalesce(ps.manually_hidden, false) and ps.category = 'ohapka'
       and ps.tilda_uid is not null and ps.price is not null and ps.product_name <> '__default__'
  ),
  sc as (
    select b.id as bid, c.id as cid, c.role as crole, b.role as brole,
      coalesce((st.rf -> b.role ->> c.role)::numeric, 1) as s_role,
      coalesce((select max(h.score) from unnest(b.color) bc cross join unnest(c.color) cc
                  join color_harmony h on (h.a = bc and h.b = cc) or (h.a = cc and h.b = bc)), 0.8) as s_color,
      coalesce((select t.score from tone_harmony t where (t.a = b.tone and t.b = c.tone) or (t.a = c.tone and t.b = b.tone) limit 1), 1) as s_tone,
      case when b.height is not null and c.height is not null and b.height <> c.height then 1 else 0 end as s_height,
      case when c.genus is not null and c.genus = b.genus then 1 else 0 end as s_same,
      exists (select 1 from product_pairs x where x.kind = 'pair'
              and ((x.a_id = b.id and x.b_id = c.id) or (x.a_id = c.id and x.b_id = b.id))) as pinned,
      coalesce((select least(2.5, s.n * 0.5) from product_co_purchase s where s.a_id = b.id and s.b_id = c.id and s.n >= 2), 0) as s_stats,
      coalesce((select least(0.8, pp.n * 0.05) from product_popularity pp where pp.product_id = c.id), 0) as s_pop,
      st.w, st.rc
    from prod b join prod c on c.id <> b.id cross join st
    where b.role is not null and c.role is not null
      and not exists (select 1 from product_pairs x where x.kind = 'block'
              and ((x.a_id = b.id and x.b_id = c.id) or (x.a_id = c.id and x.b_id = b.id)))
  ),
  tot as (
    select sc.*,
      round((w->>'role')::numeric * s_role + (w->>'color')::numeric * s_color + (w->>'tone')::numeric * s_tone
          + (w->>'height')::numeric * s_height + (w->>'same_genus')::numeric * s_same
          + (w->>'stats')::numeric * s_stats + (w->>'popularity')::numeric * s_pop
          + case when pinned then (w->>'pin')::numeric else 0 end, 2) as score,
      case when pinned then 'pin' when s_stats > 0 then 'together'
           when s_color >= 1.7 and s_tone >= 1.4 then 'palette'
           when s_color >= 1.4 then 'color' else 'role' end as reason
    from sc
  ),
  ranked as (
    select tot.*, row_number() over (partition by bid, crole order by score desc, cid) as rk
    from tot
  )
  select bid, cid, crole, score, reason, rk from ranked
  where rk <= coalesce((rc -> brole ->> crole)::int, 1) or pinned;
end $$;
revoke execute on function public.refresh_product_recs() from public, anon;
grant execute on function public.refresh_product_recs() to authenticated;

-- recompute when anything that drives recommendations changes (the table is small, takes milliseconds)
create or replace function public.trg_refresh_product_recs() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform refresh_product_recs(); return null; end $$;

drop trigger if exists refresh_recs_cards on public.product_cards;
create trigger refresh_recs_cards after insert or update of role, tone, genus, status or delete on public.product_cards
  for each statement execute function trg_refresh_product_recs();
drop trigger if exists refresh_recs_pairs on public.product_pairs;
create trigger refresh_recs_pairs after insert or update or delete on public.product_pairs
  for each statement execute function trg_refresh_product_recs();
drop trigger if exists refresh_recs_color on public.color_harmony;
create trigger refresh_recs_color after insert or update or delete on public.color_harmony
  for each statement execute function trg_refresh_product_recs();
drop trigger if exists refresh_recs_tone on public.tone_harmony;
create trigger refresh_recs_tone after insert or update or delete on public.tone_harmony
  for each statement execute function trg_refresh_product_recs();
drop trigger if exists refresh_recs_settings on public.rec_settings;
create trigger refresh_recs_settings after insert or update on public.rec_settings
  for each statement execute function trg_refresh_product_recs();

-- nightly: purchase statistics first, then recommendations (new products, colours, archive changes)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'narin_refresh_recs';
    perform cron.schedule('narin_refresh_recs', '15 2 * * *',
      'select public.refresh_product_co_purchase(); select public.refresh_product_recs();');
  end if;
end $$;

select refresh_product_recs();

-- ---------------------------------------------------------------- 4. bundle for the site
-- p: products {uid: {n,pr,img,c,r,so,u,k}}, k: ready cards {uid: {...}}, r: recs {uid: [[uid,role,score,reason]]},
-- x: accessories. One request, cached in the browser; v changes whenever content changes.
create or replace function public.get_product_card_bundle()
returns json language sql stable security definer set search_path = public as $$
with prod as (
  select ps.id, ps.tilda_uid as uid, decode_html_entities(ps.product_name) as name, ps.price, ps.category,
         coalesce(pc.images ->> 0, ps.image_url) as img, ps.color, ps.special_order, ps.order_unit_size,
         coalesce(pc.role, g.role) as role, pc.status, pc.updated_at,
         pc.product_id is not null as has_card,
         coalesce(pc.tool, g.tool, 'scissors') as tool,
         coalesce(g.low_vase, false) or ps.height = 'Nízké' as low,
         coalesce(pc.highlights, g.highlights) as hl, pc.images, pc.tone
    from product_stickers ps
    left join product_cards pc on pc.product_id = ps.id
    left join flower_genus g on g.key = coalesce(pc.genus,
         (select x.key from flower_genus x where norm_name(ps.product_name) ~ x.pattern order by x.sort limit 1))
   where ps.archived = false and not coalesce(ps.manually_hidden, false)
     and ps.tilda_uid is not null and ps.product_name <> '__default__'
)
select json_build_object(
  'v', (select coalesce(max(extract(epoch from updated_at))::bigint, 0) from prod)::text
       || '-' || (select count(*) from product_recs)::text
       || '-' || (select coalesce(extract(epoch from max(updated_at))::bigint, 0) from rec_settings)::text,
  'p', (select json_object_agg(uid, json_build_object('n', name, 'pr', price, 'img', img, 'c', color, 'r', role,
                 'so', special_order, 'u', order_unit_size, 'k', category)) from prod),
  'k', (select json_object_agg(p.uid, (to_jsonb(c) - 'product_id' - 'updated_at' - 'status' - 'images' - 'highlights' - 'source')
                 || jsonb_build_object('hl', coalesce(p.hl, '[]'::jsonb), 'im', coalesce(p.images, '[]'::jsonb), 'tool', p.tool, 'low', p.low))
          from prod p join product_cards c on c.product_id = p.id where c.status = 'ready'),
  'r', (select json_object_agg(uid, recs) from (
          select b.uid, json_agg(json_build_array(c.uid, r.role, r.score, r.reason) order by r.score desc) as recs
            from product_recs r join prod b on b.id = r.product_id join prod c on c.id = r.rec_id
           group by b.uid) t),
  'x', (select coalesce(json_agg(json_build_object('uid', a.tilda_uid, 'kind', a.kind, 'n', a.name, 'pr', a.price,
                 'img', a.image_url, 'tone', a.tone) order by a.sort), '[]'::json)
          from product_accessories a where a.active and a.kind <> 'kenzan_care')
);
$$;
grant execute on function public.get_product_card_bundle() to anon, authenticated;
