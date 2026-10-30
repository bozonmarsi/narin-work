-- Product cards: polish pass on the content moved from Tilda.
--   * the trailing "2"/"3" in the old "Výdrž" notes was the BAR LEVEL (1-3), not text: moved to vase_life_level
--   * typos fixed (Jemna -> Jemná, Sladka -> Sladká, kořená -> kořeněná, "gvozdika" -> karafiát)
--   * the delivery remark "Může být dodáno bez krabice" moved from the description to the "Důležité vědět" note
--   * two peony care steps were cut off in Tilda ("...měkký, ale ještě"): completed
--   * products that had NO text (Anturium, Fressia červená, Karafiát burgundi), no characteristics (Tulipán bílý) or no care steps
--     (Růže pink express) got texts written in the style of the sibling products; marked source = 'claude'
--     so you can review them. Heights are left empty for you.
-- Safe to re-run.

begin;

alter table public.product_cards add column if not exists vase_life_level smallint check (vase_life_level between 0 and 3);
alter table public.product_cards add column if not exists source text not null default 'owner' check (source in ('owner','claude'));

-- 1) bar level out of the note
update public.product_cards
   set vase_life_level = (regexp_match(vase_life_note, '([1-3])\s*$'))[1]::smallint,
       vase_life_note  = nullif(btrim(regexp_replace(vase_life_note, '\s*·?\s*[1-3]\s*$', '')), '')
 where vase_life_note ~ '[1-3]\s*$' and vase_life_level is null;

-- 2) typos
update public.product_cards set scent_text = case scent_text
    when 'Jemna' then 'Jemná'
    when 'Jemna bylinná' then 'Jemná bylinná'
    when 'Sladka, jemně květinová.' then 'Sladká, jemně květinová'
    when 'Silná, kořená' then 'Silná, kořeněná'
    when 'Sladce kořeněná, hřebíčková.' then 'Sladce kořeněná, hřebíčková'
    else scent_text end
 where scent_text in ('Jemna','Jemna bylinná','Sladka, jemně květinová.','Silná, kořená','Sladce kořeněná, hřebíčková.');

update public.product_cards
   set description = replace(replace(replace(description,
        'Klasická velká standardní gvozdika', 'Klasický velký standardní karafiát'),
        'Zajímavá zelená standardní gvozdika', 'Zajímavý zelený standardní karafiát'),
        'gvozdika', 'karafiát')
 where description like '%gvozdika%';

-- 3) the delivery remark belongs in the "Důležité vědět" box, not in the description
update public.product_cards
   set important_note = 'Může být dodáno bez krabice.',
       description    = btrim(regexp_replace(description, '\s*Může být dodáno bez krabice\.?\s*$', ''))
 where description ~ 'Může být dodáno bez krabice\.?\s*$' and important_note is null;

-- 4) cut-off peony step
update public.product_cards
   set care_steps = (
     select coalesce(jsonb_agg(
       case when s like '%marshmallow stage – měkký, ale ještě' then to_jsonb(s || ' pevný na dotek)')
            else to_jsonb(s) end order by ord), '[]'::jsonb)
       from jsonb_array_elements_text(care_steps) with ordinality as t(s, ord))
 where care_steps::text like '%marshmallow stage – měkký, ale ještě"%';

-- 5) texts for products that had none (same wording as the sibling products where one exists)
-- 5a) Tulipán bílý has text and care but NO characteristics: take them from the sibling "Tulipan růžový"
update public.product_cards pc
   set source = 'claude',
       vase_life_min = coalesce(pc.vase_life_min, 8), vase_life_max = coalesce(pc.vase_life_max, 14),
       vase_life_level = coalesce(pc.vase_life_level, 2),
       vase_life_note = coalesce(pc.vase_life_note, 'Patří mezi stálé řezané květiny s dobrou výdrží.'),
       water_text = coalesce(pc.water_text, '1/3 délky stonku'), water_level = coalesce(pc.water_level, 1),
       cut_text = coalesce(pc.cut_text, 'Rovný nebo mírně šikmý řez'),
       scent_text = coalesce(pc.scent_text, 'Jemná'), scent_level = coalesce(pc.scent_level, 1),
       pet_text = coalesce(pc.pet_text, (select c2.pet_text from public.product_cards c2 join public.product_stickers p2 on p2.id = c2.product_id where p2.product_name = 'Tulipan růžový' and p2.archived = false limit 1))
  from public.product_stickers ps
 where ps.id = pc.product_id and ps.archived = false and ps.product_name = 'Tulipan bilý' and pc.vase_life_min is null;

-- 5b) Růže pink express: care steps of the other rose
update public.product_cards pc
   set care_steps = (select c2.care_steps from public.product_cards c2 join public.product_stickers p2 on p2.id = c2.product_id where p2.product_name = 'Růže Bombastik spray' and p2.archived = false limit 1),
       source = 'claude'
  from public.product_stickers ps
 where ps.id = pc.product_id and ps.archived = false and ps.product_name = 'Růže pink express' and pc.care_steps = '[]'::jsonb;

-- 5c) Frézie červená = sibling "Fressia žlutá"
update public.product_cards pc
   set status = 'ready', source = 'claude',
       description = 'Sytě červené frézie s elegantním trychtýřovitým tvarem květů a jemnou sladkou vůní. Přinášejí do kytice vášnivý akcent a lehkost jarních květin, ať už stojí samy, nebo ve společnosti bílé a zelené.',
       care_steps = s.care_steps, vase_life_min = s.vase_life_min, vase_life_max = s.vase_life_max, vase_life_level = s.vase_life_level, vase_life_note = s.vase_life_note,
       water_text = s.water_text, water_level = s.water_level, cut_text = s.cut_text, scent_text = s.scent_text, scent_level = s.scent_level,
       pet_text = s.pet_text, pet_note = s.pet_note
  from public.product_stickers ps,
       (select c2.* from public.product_cards c2 join public.product_stickers p2 on p2.id = c2.product_id where p2.product_name = 'Fressia žlutá' and p2.archived = false limit 1) s
 where ps.id = pc.product_id and ps.archived = false and ps.product_name = 'Fressia červená' and pc.description is null;

-- 5d) Karafiát burgundi = care of "Karafiat Kino"
update public.product_cards pc
   set status = 'ready', source = 'claude',
       description = 'Sytě vínový velký karafiát s plnými, hustě plněnými květy na dlouhém pevném stonku. Hluboká barva působí luxusně a elegantně a skvěle ladí se světlými květinami, zelení i teplými odstíny. Spolehlivá, dlouho vydržující květina do kytic i samostatných vazeb.',
       care_steps = s.care_steps
  from public.product_stickers ps,
       (select c2.* from public.product_cards c2 join public.product_stickers p2 on p2.id = c2.product_id where p2.product_name = 'Karafiat Kino' and p2.archived = false limit 1) s
 where ps.id = pc.product_id and ps.archived = false and ps.product_name = 'Karafiát burgundi' and pc.description is null;

-- 5e) Anturium (exotic, tropical: wants warmth)
update public.product_cards pc
   set status = 'ready', source = 'claude',
       description = 'Výrazné exotické anturium s lesklým srdčitým květem v sytě červené barvě. Působí jako malá socha: moderně, graficky čistě a mimořádně trvanlivě. Skvělé v jednoduché váze samo o sobě i jako exotický akcent do větší kytice.',
       care_steps = jsonb_build_array(
         'Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)',
         'Vyměňujte vodu každé 2–3 dny a vždy důkladně umyjte vázu',
         'Každé 3–4 dny seřízněte stonek šikmo o 2 cm',
         'Odstraňte listy, které by byly ponořené ve vodě',
         'Anturium je tropická květina: držte ji v teple (nad 15 °C), mimo průvan a chladná okna',
         'Květ otírejte jen suchým nebo mírně vlhkým hadříkem, nestříkejte ho'),
       vase_life_min = 14, vase_life_max = 21, vase_life_level = 3, vase_life_note = 'Patří mezi nejtrvanlivější řezané květiny.',
       water_text = '1/3 délky stonku', water_level = 1, cut_text = 'Šikmý řez na 45 stupňů',
       scent_text = 'Prakticky bez vůně', scent_level = 0,
       pet_text = 'Toxický při pozření', pet_note = 'Obsahuje šťavelany. Držte mimo dosah koček a psů.'
  from public.product_stickers ps
 where ps.id = pc.product_id and ps.archived = false and ps.product_name = 'Anturium' and pc.description is null;

commit;
