-- Product card content + smart recommendations (Dokončete kytici / Ladí k tomu).
--
-- WHY: the text of a flower (description, care, vase life, water level, pets, ...) used to live in
-- Tilda product fields in a hand-made "a # b # 2" format. Now it lives here, is edited in the manager
-- app, and the site reads it through ONE fast function: get_product_card(tilda_uid).
--
-- SAFE TO APPLY: only creates new objects and fills them (no existing table is changed).
-- Apply in the Supabase SQL Editor as one script; it is idempotent (can be re-run).

begin;

-- helper: accent-free lowercase name, HTML entities decoded (same idea as the catalog code)
create or replace function public.norm_name(p text) returns text
language sql immutable as $$
  select lower(translate(decode_html_entities(coalesce(p, '')),
    'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ', 'acdeeinorstuuyzacdeeinorstuuyz'))
$$;

-- ---------------------------------------------------------------- flower genera (editable rules)
create table if not exists public.flower_genus (
  key        text primary key,
  label      text not null,
  pattern    text not null,                    -- regexp on norm_name(product_name)
  role       text not null check (role in ('focal','filler','greenery','accent')),
  tool       text not null check (tool in ('secateur','scissors')),
  low_vase   boolean not null default false,   -- usually arranged low (offer low vase + kenzan)
  sort       int not null default 100
);
alter table public.flower_genus enable row level security;
drop policy if exists manager_write_flower_genus on public.flower_genus;
create policy manager_write_flower_genus on public.flower_genus for all
  using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());

insert into public.flower_genus (key, label, pattern, role, tool, low_vase, sort) values
  ('pivonka','Pivoňka','pivon','focal','secateur',false,10),
  ('ruze','Růže','ruze','focal','secateur',false,20),
  ('hortenzie','Hortenzie','horten','focal','secateur',false,30),
  ('dahlia','Dahlia','dahlia','focal','secateur',false,40),
  ('gerbera','Gerbera','gerbera','focal','scissors',false,50),
  ('karafiat','Karafiát','karafi','focal','scissors',false,60),
  ('tulipan','Tulipán','tulip','focal','scissors',true,70),
  ('ranunculus','Ranunculus','ranunc','focal','scissors',true,80),
  ('lilie','Lilie','lili','focal','scissors',false,90),
  ('slunecnice','Slunečnice','slunecn','focal','secateur',false,100),
  ('chryzantema','Chryzantéma','chryzant','focal','secateur',false,110),
  ('eustoma','Eustoma','eustoma','filler','scissors',false,120),
  ('freesia','Frézie','(freesia|fressia)','filler','scissors',false,130),
  ('matthiola','Matthiola','matthiola','filler','scissors',false,140),
  ('hermanek','Heřmánek','hermanek','filler','scissors',false,150),
  ('eukalyptus','Eukalyptus','eukalypt','greenery','secateur',false,160),
  ('moluccella','Moluccella','moluc','greenery','scissors',false,170),
  ('eryngium','Eryngium','eryngium','greenery','secateur',false,180),
  ('leucadendron','Leucadendron','leucadendron','greenery','secateur',false,190),
  ('kala','Kala','(kala|calla)','accent','scissors',false,200),
  ('allium','Allium','allium','accent','scissors',false,210),
  ('delphinium','Delphinium','delphin','accent','scissors',false,220),
  ('hyacint','Hyacint','hyacint','accent','scissors',true,230),
  ('anturium','Anturium','anturi','accent','scissors',false,240),
  ('amarylis','Amarylis','amarylis','accent','scissors',false,250),
  ('leucospermum','Leucospermum','leucosp','accent','secateur',false,260),
  ('protea','Protea','protea','accent','secateur',false,270),
  ('magnolie','Magnolie','magnol','accent','secateur',false,280),
  ('nerine','Nerine','nerine','accent','scissors',false,290)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- the card content itself
create table if not exists public.product_cards (
  product_id      uuid primary key references public.product_stickers(id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft','ready')),
  genus           text references public.flower_genus(key) on update cascade on delete set null,
  role            text check (role in ('focal','filler','greenery','accent')),  -- overrides the genus role (e.g. spray rose = filler)
  tool            text check (tool in ('secateur','scissors')),
  description     text,
  care_steps      jsonb not null default '[]'::jsonb,        -- ["Postavte ihned do vázy ...", ...]
  extra_sections  jsonb not null default '[]'::jsonb,        -- [{"title":"...","items":["..."]}]
  vase_life_min   int,
  vase_life_max   int,
  vase_life_note  text,
  water_text      text,
  water_level     smallint check (water_level between 1 and 3),
  cut_text        text,
  height_text     text,
  height_note     text,
  scent_text      text,
  scent_level     smallint check (scent_level between 0 and 3),
  pet_text        text,
  pet_note        text,
  important_note  text,
  updated_at      timestamptz not null default now()
);
alter table public.product_cards enable row level security;
drop policy if exists manager_write_product_cards on public.product_cards;
create policy manager_write_product_cards on public.product_cards for all
  using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());

-- curated pairs (kind='pair': always suggest; kind='block': never suggest)
create table if not exists public.product_pairs (
  a_id  uuid not null references public.product_stickers(id) on delete cascade,
  b_id  uuid not null references public.product_stickers(id) on delete cascade,
  kind  text not null default 'pair' check (kind in ('pair','block')),
  note  text,
  primary key (a_id, b_id),
  check (a_id <> b_id)
);
alter table public.product_pairs enable row level security;
drop policy if exists manager_write_product_pairs on public.product_pairs;
create policy manager_write_product_pairs on public.product_pairs for all
  using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());

-- accessories offered under "Dokončete kytici" (tools, vases, kenzans, postcards, later: designer vases)
create table if not exists public.product_accessories (
  tilda_uid  text primary key,
  kind       text not null check (kind in ('secateur','scissors','vase_low','vase','kenzan','kenzan_care','postcard')),
  name       text not null,
  price      numeric,
  image_url  text,
  tone       text,                         -- postcards: 'warm' (pink) or 'cool' (blue)
  sort       int not null default 100,
  active     boolean not null default true
);
alter table public.product_accessories enable row level security;
drop policy if exists manager_write_product_accessories on public.product_accessories;
create policy manager_write_product_accessories on public.product_accessories for all
  using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());

-- old spellings used in past orders -> current product (so statistics see through the old names)
create table if not exists public.order_name_map (
  old_name   text primary key,                 -- as decode_html_entities, lower-case
  product_id uuid not null references public.product_stickers(id) on delete cascade
);
alter table public.order_name_map enable row level security;

-- colour harmony between two flower colours (0..2). The manager can tune it; unknown pairs score 0.8.
create table if not exists public.color_harmony (
  a text not null, b text not null, score numeric not null check (score between 0 and 2),
  primary key (a, b)
);
alter table public.color_harmony enable row level security;
drop policy if exists manager_write_color_harmony on public.color_harmony;
create policy manager_write_color_harmony on public.color_harmony for all
  using (is_manager() or is_warehouse()) with check (is_manager() or is_warehouse());
-- symmetric pairs, written once; the function looks at both directions
insert into public.color_harmony (a, b, score) values
  ('Bílá','Bílá',1.0),('Bílá','Zelená',1.8),('Bílá','Růžová',2.0),('Bílá','Červená',2.0),('Bílá','Fialová',2.0),('Bílá','Modrá',2.0),('Bílá','Žlutá',2.0),
  ('Zelená','Zelená',0.6),('Zelená','Růžová',2.0),('Zelená','Červená',2.0),('Zelená','Fialová',1.8),('Zelená','Modrá',1.8),('Zelená','Žlutá',2.0),
  ('Růžová','Růžová',1.4),('Růžová','Červená',1.5),('Růžová','Fialová',1.6),('Růžová','Modrá',1.0),('Růžová','Žlutá',0.5),
  ('Červená','Červená',1.2),('Červená','Fialová',0.8),('Červená','Modrá',0.4),('Červená','Žlutá',1.0),
  ('Fialová','Fialová',1.3),('Fialová','Modrá',1.6),('Fialová','Žlutá',1.2),
  ('Modrá','Modrá',1.2),('Modrá','Žlutá',1.2),
  ('Žlutá','Žlutá',1.2)
on conflict (a, b) do nothing;

-- statistics: how many orders contain both products (rebuilt by refresh_product_co_purchase())
create table if not exists public.product_co_purchase (
  a_id uuid not null, b_id uuid not null, n int not null,
  primary key (a_id, b_id)
);
alter table public.product_co_purchase enable row level security;

-- statistics: how often each product was ordered (a small popularity tie-breaker)
create table if not exists public.product_popularity (
  product_id uuid primary key, n int not null
);
alter table public.product_popularity enable row level security;

-- ---------------------------------------------------------------- statistics (rebuild nightly)
create or replace function public.refresh_product_co_purchase() returns void
language plpgsql security definer set search_path = public as $$
begin
  truncate public.product_co_purchase;
  insert into public.product_co_purchase (a_id, b_id, n)
  with lines as (
    select o.order_id, coalesce(m.product_id, ps.id) as pid
    from tilda_orders o
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(o.raw_payload->'payment'->'products') = 'array'
           then o.raw_payload->'payment'->'products' else '[]'::jsonb end) pr
    left join order_name_map m on m.old_name = lower(decode_html_entities(pr->>'name'))
    left join product_stickers ps on ps.archived = false and ps.product_name <> '__default__'
         and (ps.product_name = pr->>'name' or decode_html_entities(ps.product_name) = decode_html_entities(pr->>'name'))
    where o.status::text <> 'cancelled'
  ), uniq as (select distinct order_id, pid from lines where pid is not null)
  select a.pid, b.pid, count(*)::int
  from uniq a join uniq b on a.order_id = b.order_id and a.pid <> b.pid
  group by 1, 2;

  truncate public.product_popularity;
  insert into public.product_popularity (product_id, n)
  with lines as (
    select o.order_id, coalesce(m.product_id, ps.id) as pid
    from tilda_orders o
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(o.raw_payload->'payment'->'products') = 'array'
           then o.raw_payload->'payment'->'products' else '[]'::jsonb end) pr
    left join order_name_map m on m.old_name = lower(decode_html_entities(pr->>'name'))
    left join product_stickers ps on ps.archived = false and ps.product_name <> '__default__'
         and (ps.product_name = pr->>'name' or decode_html_entities(ps.product_name) = decode_html_entities(pr->>'name'))
    where o.status::text <> 'cancelled'
  )
  select pid, count(distinct order_id)::int from lines where pid is not null group by pid;
end $$;

-- ---------------------------------------------------------------- ranking of "goes well with"
-- Availability / delivery date is NOT judged here (reserved stock lives elsewhere): the site checks it.
create or replace function public.rank_pairs(p_id uuid)
returns table (product_id uuid, score numeric, reasons text[])
language sql stable security definer set search_path = public as $$
with prod as (
  select ps.id, ps.product_name, ps.color, ps.height, ps.special_order, ps.category, ps.quantity, ps.vanvliet_in_stock,
         ps.archived, ps.manually_hidden, ps.tilda_uid, ps.price,
         coalesce(pc.role, gg.role) as role, gg.key as genus
  from product_stickers ps
  left join product_cards pc on pc.product_id = ps.id
  left join flower_genus gg on gg.key = coalesce(pc.genus,
         (select g.key from flower_genus g where norm_name(ps.product_name) ~ g.pattern order by g.sort limit 1))
),
b as (select * from prod where id = p_id),
c as (
  select p.* from prod p
  where p.archived = false and not coalesce(p.manually_hidden, false) and p.category = 'ohapka'
    and p.id <> p_id and p.tilda_uid is not null and p.price is not null and p.product_name <> '__default__'
    and not (not p.special_order and coalesce(p.quantity, 0) <= 0 and coalesce(p.vanvliet_in_stock, false) = false)
    and not exists (select 1 from product_pairs x where x.kind = 'block'
          and ((x.a_id = p_id and x.b_id = p.id) or (x.a_id = p.id and x.b_id = p_id)))
),
sc as (
  select c.id as product_id, c.role as c_role,
    case b.role
      when 'focal'    then case c.role when 'filler' then 3.0 when 'greenery' then 2.6 when 'accent' then 1.6 when 'focal' then 1.2 else 0 end
      when 'filler'   then case c.role when 'focal' then 3.0 when 'greenery' then 2.0 when 'accent' then 1.5 when 'filler' then 0.3 else 0 end
      when 'greenery' then case c.role when 'focal' then 3.0 when 'filler' then 2.0 when 'accent' then 1.5 when 'greenery' then 0.2 else 0 end
      else case c.role when 'focal' then 2.5 when 'greenery' then 2.0 when 'filler' then 2.0 else 0.8 end end as s_role,
    coalesce(
      (select max(h.score) from unnest(b.color) bc cross join unnest(c.color) cc
         join color_harmony h on (h.a = bc and h.b = cc) or (h.a = cc and h.b = bc)),
      0.8) as s_color,
    case when b.height is not null and c.height is not null and b.height <> c.height then 0.6 else 0 end as s_height,
    case when c.genus is not null and c.genus = b.genus then -1.5 else 0 end as s_same,
    case when exists (select 1 from product_pairs x where x.kind = 'pair'
          and ((x.a_id = p_id and x.b_id = c.id) or (x.a_id = c.id and x.b_id = p_id))) then 5.0 else 0 end as s_curated,
    coalesce((select least(2.5, s.n * 0.5) from product_co_purchase s where s.a_id = p_id and s.b_id = c.id and s.n >= 2), 0) as s_stats,
    coalesce((select least(0.8, pp.n * 0.05) from product_popularity pp where pp.product_id = c.id), 0) as s_pop
  from c cross join b
)
select sc.product_id,
       round(sc.s_role + sc.s_color + sc.s_height + sc.s_same + sc.s_curated + sc.s_stats + sc.s_pop, 2),
       array_remove(array[
         case when sc.s_curated > 0 then 'curated' end,
         case when sc.s_stats > 0 then 'stats' end,
         'role_' || sc.c_role,
         case when sc.s_color >= 1.8 then 'color_neutral' when sc.s_color >= 1.4 then 'color_match' end], null)
from sc
$$;

-- ---------------------------------------------------------------- what the site reads
create or replace function public.get_product_card(p_uid text)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid; v_tool text; v_low boolean; v_tone text; v_json json;
begin
  select ps.id into v_id from product_stickers ps
   where ps.tilda_uid = p_uid and ps.archived = false and not coalesce(ps.manually_hidden, false) limit 1;
  if v_id is null then return null; end if;

  select coalesce(pc.tool, g.tool, 'scissors'),
         coalesce(g.low_vase, false) or ps.height = 'Nízké',
         case when ps.color && array['Růžová','Červená','Bílá'] then 'warm' else 'cool' end
    into v_tool, v_low, v_tone
    from product_stickers ps
    left join product_cards pc on pc.product_id = ps.id
    left join flower_genus g on g.key = coalesce(pc.genus,
         (select x.key from flower_genus x where norm_name(ps.product_name) ~ x.pattern order by x.sort limit 1))
   where ps.id = v_id;

  select json_build_object(
    'uid', ps.tilda_uid,
    'name', decode_html_entities(ps.product_name),
    'category', ps.category,
    'price', ps.price,
    'colors', ps.color,
    'height', ps.height,
    'fragrant', ps.fragrant,
    'special_order', ps.special_order,
    'card', (select to_jsonb(c) - 'product_id' - 'updated_at' - 'status'
               from product_cards c where c.product_id = ps.id and c.status = 'ready'),
    'pairs', (
      select coalesce(json_agg(t order by t.score desc, t.name), '[]'::json) from (
        select ps2.tilda_uid as uid, decode_html_entities(ps2.product_name) as name, ps2.price,
               ps2.image_url, ps2.color as colors, ps2.special_order, r.score, r.reasons,
               coalesce(pc2.role, gg.role) as role,
               row_number() over (partition by coalesce(pc2.role, gg.role) order by r.score desc, ps2.product_name) as rn
          from rank_pairs(v_id) r
          join product_stickers ps2 on ps2.id = r.product_id
          left join product_cards pc2 on pc2.product_id = ps2.id
          left join flower_genus gg on gg.key = coalesce(pc2.genus,
               (select x.key from flower_genus x where norm_name(ps2.product_name) ~ x.pattern order by x.sort limit 1))
      ) t
      where (t.role = 'filler' and t.rn <= 5) or (t.role = 'greenery' and t.rn <= 3)
         or (t.role = 'focal' and t.rn <= 3) or (t.role = 'accent' and t.rn <= 3)
    ),
    'finish', (
      select coalesce(json_agg(f order by f.sort), '[]'::json) from (
        select a.tilda_uid as uid, a.kind, a.name, a.price, a.image_url, a.sort
          from product_accessories a
         where a.active and (
               a.kind = v_tool
            or (v_low and a.kind in ('vase_low','kenzan'))
            or (a.kind = 'postcard' and a.tone = v_tone))
      ) f
    )
  ) into v_json
  from product_stickers ps where ps.id = v_id;

  return v_json;
end $$;

revoke all on function public.rank_pairs(uuid) from public, anon, authenticated;
revoke all on function public.refresh_product_co_purchase() from public, anon, authenticated;
grant execute on function public.get_product_card(text) to anon, authenticated;

-- ---------------------------------------------------------------- content moved from Tilda (owner-written text, unchanged)
insert into public.product_cards (product_id, status, description, care_steps, extra_sections, vase_life_min, vase_life_max, vase_life_note, water_text, water_level, cut_text, height_text, height_note, scent_text, scent_level, pet_text, pet_note)
select ps.id, case when v.description is not null and v.description <> '' then 'ready' else 'draft' end, v.description, v.care::jsonb, v.extra::jsonb, v.vmin, v.vmax, v.vnote, v.water, v.wlevel, v.cut, v.height, v.hnote, v.scent, v.slevel, v.pet, v.pnote
from (values
  ($j$548551220284$j$, $j$Oblíbená klasická odrůda s velkými, plnými světle růžovými květy. Romantický, bohatý a elegantní vzhled s jemnými vrstvami okvětních lístků. Skvěle se hodí do luxusních kytic i samostatných vazeb – jedna z nejoblíbenějších řezaných pivoněk díky kráse a výdrži.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)", "Nejlepší výdrž mají květy řezané v pupenu (marshmallow stage – měkký, ale ještě"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Sladka, jemně květinová.$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$308716797514$j$, $j$Oblíbená klasická odrůda s velkými, plnými bílými květy. Romantický, bohatý a elegantní vzhled s jemnými vrstvami okvětních lístků. Skvěle se hodí do luxusních kytic i samostatných vazeb — jedna z nejoblíbenějších řezaných pivoňek díky své kráse, jemnosti a skvělé výdrži.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)", "Nejlepší výdrž mají květy řezané v pupenu (marshmallow stage – měkký, ale ještě"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehká, sladce květinová$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$850474817824$j$, $j$Růžová dahlie je bohatá, plná řezaná květina s pravidelně uspořádanými okvětními lístky v jemných odstínech růžové, od pudrové až po sytě malinovou. Dodává kompozicím měkkost, objem a romantický, letní charakter. Je oblíbená ve svatebních vazbách, kyticích i velkých vázách, kde i několik stonků působí bohatě a efektně.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Stonky jsou dutá a citlivé na bakterie, proto vodu vyměňujte každé 1–2 dny a vázu vždy důkladně umyjte", "Dahlie nepřijímá vodu přes poupata, proto vybírejte plně rozkvetlé květy", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 5, 7, $j$Dahlie patří mezi kratší výdrž, vydrží déle v chladu a při časté výměně vody$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehce bylinné, téměř neutrální$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$353040386354$j$, $j$Dahlia Caitlin's Joy je velkolepá, plná řezaná květina s bohatě vrstvenými, mírně špičatými okvětními lístky v jemných korálově růžových až broskvových odstínech. Působí měkce, romanticky a přitom výrazně, proto je oblíbená ve svatebních vazbách, kyticích i velkých vázách. Skvěle se kombinuje s krémovou, bílou, burgundskou i zelenou a dodává kompozicím objem a letní, jemně dekadentní charakter.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Stonky jsou dutá a citlivé na bakterie, proto vodu vyměňujte každé 1–2 dny a vázu vždy důkladně umyjte", "Dahlie nepřijímá vodu přes poupata, proto vybírejte plně rozkvetlé květy", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 5, 7, $j$Dahlie patří mezi kratší výdrž, vydrží déle v chladu a při časté výměně vody$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehce bylinné, téměř neutrální$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$751727463504$j$, $j$Moluccella (molucká meduňka, „Bells of Ireland“) je nápadná řezaná květina s dlouhými, svisle rostoucími stonky, na kterých v pravidelných přeslenech sedí světle zelené, zvonkovité kalichy. Uvnitř nich se skrývají drobné bílé květy, ale hlavní ozdobou jsou právě svěží zelené kalichy. Dodává kompozicím výšku, strukturu a čerstvý, moderní nádech, proto je oblíbená ve svatebních vazbách, kyticích i velkých vázách. Dobře se kombinuje s růžemi, pivoňkami, hortenziemi i jednoduchými letními květinami.

Může být dodáno bez krabice$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Vodu vyměňujte každé 2–3 dny a vázu vždy důkladně umyjte", "Stonky jsou na kalichách mírně ostnité, při aranžování doporučujeme rukavice", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Nedávejte do blízkosti zralého ovoce, které uvolňuje etylen a urychluje vadnutí", "Ideální teplota: 10–18 °C"]$j$, $j$[]$j$, 6, 7, $j$Vhodné i k sušení · Po zaschnutí zůstává dekorativní a mění barvu do krémové až béžové$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$50–70 cm$j$, $j$Přibližná výška, může se lišit podle sezóny a dodavatele$j$, $j$Lehce bylinné, téměř neutrální$j$, 2, $j$Bezpečné$j$, $j$Moluccella není známá jako výrazně toxická pro kočky a psy$j$),
  ($j$713650839914$j$, $j$Malinová dahlie je bohatá řezaná květina s kulatými, hustě vrstvenými hlavami a pravidelně uspořádanými okvětními lístky v sytých malinově červenorůžových odstínech s jemným korálovým nádechem na okrajích. Tmavší střed a plný tvar květu dodávají kompozicím hloubku, objem a výrazný charakter. Je oblíbená v kyticích, podzimních a slavnostních vazbách i ve velkých vázách, kde působí bohatě už při několika stoncích.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Stonky jsou dutá a citlivé na bakterie, proto vodu vyměňujte každé 1–2 dny a vázu vždy důkladně umyjte", "Dahlie nepřijímá vodu přes poupata, proto vybírejte plně rozkvetlé květy", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 5, 7, $j$Dahlie patří mezi kratší výdrž, vydrží déle v chladu a při časté výměně vody$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehce bylinné, téměř neutrální$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$636097479844$j$, $j$Dahlia Sunny Boy je bohatá řezaná květina s plnými, hustě vrstvenými hlavami v zářivých slunečních odstínech, od citrónově žluté po sytě oranžovou s červeným středem. Působí veselě, teple a podzimně, proto je oblíbená v kyticích, slavnostních vazbách i větších vázách. Na jednom stonku se často objevují i poupata, která se postupně rozkvétají a prodlužují radost z kytice.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Stonky jsou dutá a citlivé na bakterie, proto vodu vyměňujte každé 1–2 dny a vázu vždy důkladně umyjte", "Dahlie nepřijímá vodu přes poupata, proto vybírejte plně rozkvetlé květy", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 5, 7, $j$Dahlie patří mezi kratší výdrž, vydrží déle v chladu a při časté výměně vody$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehce bylinné, téměř neutrální$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$171700842964$j$, $j$Bordó dahlie je bohatá, plná řezaná květina s pravidelně uspořádanými okvětními lístky v hlubokých vínových až světlé červených odstínech. Působí luxusně, dramaticky a sametově, proto je oblíbená v podzimních a slavnostních vazbách, kyticích i velkých vázách. Skvěle se kombinuje s bílou, krémovou, broskvovou i zelenou a dodává kompozicím hloubku, objem a výrazný charakter.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Stonky jsou dutá a citlivé na bakterie, proto vodu vyměňujte každé 1–2 dny a vázu vždy důkladně umyjte", "Dahlie nepřijímá vodu přes poupata, proto vybírejte plně rozkvetlé květy", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 5, 7, $j$Dahlie patří mezi kratší výdrž, vydrží déle v chladu a při časté výměně vody$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehce bylinné, téměř neutrální$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$814897482974$j$, $j$Bílá dahlie je bohatá, plná řezaná květina s pravidelně uspořádanými okvětními lístky v odstínech od čistě bílé po jemně krémovou. Působí čistě, elegantně a romanticky, proto je oblíbená ve svatebních vazbách, kyticích i velkých vázách. Dobře se kombinuje s jakoukoli barvou a dodává kompozicím objem, měkkost a svěží letní charakter.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Stonky jsou dutá a citlivé na bakterie, proto vodu vyměňujte každé 1–2 dny a vázu vždy důkladně umyjte", "Dahlie nepřijímá vodu přes poupata, proto vybírejte plně rozkvetlé květy", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 5, 7, $j$Dahlie patří mezi kratší výdrž, vydrží déle v chladu a při časté výměně vody$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehce bylinné, téměř neutrální$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$965689494084$j$, $j$Polodvojitá pivoňka s unikátní měnící se barvou. Květy začínají sytě korálově-růžové, postupně přecházejí přes oranžovou a lososovou až do světle krémové. Květy s výraznými zlatými tyčinkami uprostřed – dramatická a velmi oblíbená odrůda pro luxusní vazby.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)", "Nejlepší výdrž mají květy řezané v pupenu (marshmallow stage – měkký, ale ještě neotevřený)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$814926079464$j$, $j$Intenzivně červená, velmi plná a kompaktní pivoňka s bombovitým tvarem květu. Bohaté, téměř černě-červené odstíny na začátku kvetení, které se postupně otevírají do jasně karmínové. Silný stonek a velké květy – ideální pro výrazné a luxusní vazby.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)", "Nejlepší výdrž mají květy řezané v pupenu (marshmallow stage – měkký, ale ještě neotevřený)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá, lehce sladká$j$, 2, $j$Toxický při pozření$j$, $j$Obsahuje toxické látky typické pro pivoňky. Držte mimo dosah koček a psů.$j$),
  ($j$433298943584$j$, $j$je velkolepá řezaná květina se sytě červenými, sametovými květy trumpetovitého tvaru, které sedí po dvou až čtyřech na silném, dutém stonku. Působí luxusně, slavnostně a dramaticky, proto je oblíbená v zimních a vánočních kompozicích, v moderních vázách i v dárkových vazbách. I jediný stonek dokáže být samostatným centrem pozornosti.
Může být dodáno bez krabice$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte rovně a nalijte do vázy jen menší množství vody, zhruba 10 cm", "Dutý stonek můžete podepřít tenkou tyčinkou nebo ho naplnit vodou a zacpat vatou", "Vodu vyměňujte každé 2–3 dny a vázu vždy důkladně umyjte", "Stonek se rád stáčí za světlem, proto vázu občas otočte", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 10, 14, $j$Květy se postupně otevírají, vydrží déle v chladu$j$, $j$Stonky nesnášejí příliš vysokou hladinu, hrozí praskání a stáčení$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$50–70 cm$j$, $j$Přibližná výška, může se lišit podle sezóny a dodavatele$j$, $j$Prakticky bez vůně$j$, 1, $j$Jedovaté$j$, $j$Cibule i stonek obsahují toxické látky, umístěte mimo dosah koček a psů$j$),
  ($j$617986607354$j$, $j$Klasický růžový tulipán s jemnými plátky a elegantním tvarem. Svěží jarní vzhled, který přináší do interiéru něhu a světlou barvu. Dobře se hodí do jednoduchých vazeb i jako doplněk k jiným květinám.$j$, $j$["Vyměňujte vodu každý den (mají velkou žízeň a rychle znečišťují vodu)", "Každé 2 dny seřízněte stonek rovně nebo mírně šikmo o 1–2 cm", "Nechte tulipány nejprve 1–2 hodiny stát samostatně (uvolňují šťávu, která škodí ostatním květinám)", "Vyhněte se teplu, přímému slunci a průvanu – ideálně chladnější místo (do 20 °C)", "Můžete přidat kostku ledu do vázy pro delší svěžest"]$j$, $j$[{"title": null, "items": ["Postavte ihned do čisté vázy se"]}, {"title": null, "items": ["nbsp;studenou"]}]$j$, 8, 14, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Jemna$j$, 1, $j$Obsahuje tulipalin A a B. Zvláště nebezpečný pro kočky a psy – držte mimo dosah.$j$, NULL::text),
  ($j$570577802934$j$, $j$Čistě bílý tulipán s elegantními plátky a klasickým tvarem. Svěží, minimalistický a velmi elegantní vzhled. Skvěle se hodí do moderních i romantických vazeb, dodává čistotu a světlo do interiéru.$j$, $j$["Vyměňujte vodu každý den (mají velkou žízeň a rychle znečišťují vodu)", "Každé 2 dny seřízněte stonek rovně nebo mírně šikmo o 1–2 cm", "Nechte tulipány nejprve 1–2 hodiny stát samostatně (uvolňují šťávu, která škodí ostatním květinám)", "Vyhněte se teplu, přímému slunci a průvanu – ideálně chladnější místo (do 20 °C)", "Můžete přidat kostku ledu do vázy pro delší svěžest"]$j$, $j$[{"title": null, "items": ["Postavte ihned do čisté vázy se"]}, {"title": null, "items": ["nbsp;studenou"]}]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text),
  ($j$886242981034$j$, $j$Půvabná růžová kustová růže s plnými, hustě naplněnými květy a romantickým vzhledem. Mnoho drobných květů na jednom stonku vytváří bohatý, objemný efekt. Skvěle se hodí do kytic i samostatných vazeb – dodává objem a jemnou barvu.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm", "Odstraňte listy a trny, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehká, sladce květinová$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$633022464054$j$, $j$Elegantní, bohatě plná růže s intenzivní růžovou barvou a klasickým tvarem květu. Odrůda Pink Express je oblíbená pro své velké, husté květy, dlouhé stonky a vynikající výdrž. Má jemný, ale výrazný romantický vzhled, který vypadá luxusně jak v monokompozicích, tak ve velkých smíšených vazbách.$j$, $j$[]$j$, $j$[{"title": null, "items": ["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)\nVyměňujte vodu každé 1–2 dny a vždy důkladně umyjte vázu\nKaždé 2 dny seřízněte stonek šikmo pod vodou (úhel 45°)\nOdstraňte všechny listy, které by byly ponořené ve vodě\nKaždý den lehce oroste květy\nChraňte před přímým sluncem, průvanem a teplotami nad 22 °C"]}]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$2/3 délky stonku$j$, 2, $j$Šikmý řez na 45 stupňů$j$, NULL::text, NULL::text, $j$Intenzivní, sladké, klasické růžové$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$711090832174$j$, $j$Svěží, voňavé a radostné žluté frézie s klasickým trychtýřovitým tvarem květů. Mají intenzivní sladkou vůni a zářivě žlutou barvu, která okamžitě rozzáří každou kompozici. Frézie patří mezi nejoblíbenější jarní květiny díky své nádherné vůni, elegance a skvělé výdrži.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 1–2 dny a vždy důkladně umyjte vázu", "Každé 2 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ponořené ve vodě", "Každý den lehce oroste květy — frézie milují vlhkost", "Chraňte před přímým sluncem a teplotami nad 22 °C (ideálně 15–20 °C)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Intenzivní, sladké, citrusově-květinové$j$, 3, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$793586616424$j$, $j$Bílá frézie je jemná řezaná květina s elegantně prohnutými stonky, na kterých v řadě sedí trychtýřovité, krémově bílé květy. Patří k nejvoňavějším řezaným květinám: její svěží, sladká vůně naplní celou místnost. Dodává kompozicím lehkost, čistotu a romantický charakter, proto je oblíbená ve svatebních vazbách, kyticích i malých vázách.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Vodu vyměňujte každé 2–3 dny a vázu vždy důkladně umyjte", "Průběžně odstraňujte odkvetlé květy ve spodní části, prodloužíte tím výdrž ostatních poupat", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Nedávejte do blízkosti zralého ovoce, frézie je citlivá na etylen", "Ideální teplota: 12–18 °C"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Výrazná, sladká a svěží$j$, NULL::int, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$198666273724$j$, NULL::text, $j$[]$j$, $j$[]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, $j$10-14$j$, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text),
  ($j$665941409814$j$, $j$Elegantní ranunculus s jemnými pastelově růžovo-bílými odstíny a vrstvenými, papírovitými plátky. Husté, bohaté květy s romantickým vzhledem připomínají malou pivoňku. Skvěle se hodí do jemných, elegantních a svatebních vazeb – dodává objem a jemnou barvu.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 1–2 cm (stonky jsou tenké a choulostivé)", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)", "Nejlepší výdrž mají květy řezané v barevném pupenu (marshmallow stage – měkký, ale ještě neotevřený)"]$j$, $j$[]$j$, 14, 18, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Jemna$j$, 1, $j$Mírně toxický při pozření$j$, $j$Obsahuje ranunkulin a další toxické látky. Držte mimo dosah koček a psů.$j$),
  ($j$457705847914$j$, $j$Intenzivní fialová gerbera s velkým, výrazným květem. Symbolizuje tajuplnost, kreativitu a eleganci. Velmi dobře funguje v moderních i romantických kompozicích. Díky své hluboké barvě dodává aranžmá hloubku a luxusní nádech.$j$, $j$["Seřezávejte stonek každý den pod úhlem 45° pod vodou", "Vodu měňte každý den (gerbery velmi rychle znečišťují vodu)", "Odstraňte listy, které by byly ve vodě", "Chraňte před přímým sluncem a průvanem", "Ideální teplota: 18–22 °C"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Velmi jemné, lehce sladké, příjemné$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$352589235374$j$, $j$Gerbera Cream Springs je jemná řezaná květina s velkou, otevřenou hlavou a pravidelnými paprskovitými okvětními lístky v krémových, jemně smetanových odstínech. Působí čistě, vesele a elegantně, proto je oblíbená v kyticích, svatebních vazbách i malých vázách. Dobře se kombinuje s bílou, broskvovou, zelenou i sytými barvami a dodává kompozicím lehkost a svěží, moderní charakter.$j$, $j$["Seřezávejte stonek každý den pod úhlem 45° pod vodou", "Vodu měňte každý den (gerbery velmi rychle znečišťují vodu)", "Odstraňte listy, které by byly ve vodě", "Chraňte před přímým sluncem a průvanem", "Ideální teplota: 18–22 °C"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Velmi jemné, lehce sladké, příjemné$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$617464236744$j$, $j$Slunná, veselá a velmi pozitivní žlutá gerbera. Přináší do kompozice světlo, radost a energii. Výborně funguje jak v monochromatických žlutých vazbách, tak v kontrastu s modrými a fialovými květinami.$j$, $j$["Seřezávejte stonek každý den pod úhlem 45° pod vodou", "Vodu měňte každý den (gerbery velmi rychle znečišťují vodu)", "Odstraňte listy, které by byly ve vodě", "Chraňte před přímým sluncem a průvanem", "Ideální teplota: 18–22 °C"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Velmi jemné, lehce sladké, příjemné$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$996371485614$j$, $j$Slunná, veselá a velmi pozitivní růžová gerbera. Přináší do kompozice světlo, radost a energii. Výborně funguje jak v monochromatických růžových vazbách, tak v kontrastu s modrými a bilými květinami.$j$, $j$["Seřezávejte stonek každý den pod úhlem 45° pod vodou", "Vodu měňte každý den (gerbery velmi rychle znečišťují vodu)", "Odstraňte listy, které by byly ve vodě", "Chraňte před přímým sluncem a průvanem", "Ideální teplota: 18–22 °C"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Velmi jemné, lehce sladké, příjemné$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$745136945574$j$, $j$Jemná, romantická a velmi elegantní světle fialová gerbera s velkým květem. Má jemný, téměř levandulový odstín. Skvěle funguje v romantických, jemných i moderních kompozicích. Dodává aranžmá lehkost, něžnost a sofistikovaný vzhled.$j$, $j$["Seřezávejte stonek každý den pod úhlem 45° pod vodou", "Vodu měňte každý den (gerbery velmi rychle znečišťují vodu)", "Odstraňte listy, které by byly ve vodě", "Chraňte před přímým sluncem a průvanem", "Ideální teplota: 18–22 °C"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Velmi jemné, lehce sladké, příjemné$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$503976290794$j$, $j$Jasná, veselá a velmi oblíbená růžová gerbera s velkým, výrazným květem. Symbolizuje radost, pozitivitu a lehkost. Skvěle funguje jak v romantických, tak v moderních kompozicích. Díky své jasné barvě okamžitě přitahuje pozornost.$j$, $j$["Seřezávejte stonek každý den pod úhlem 45° pod vodou", "Vodu měňte každý den (gerbery velmi rychle znečišťují vodu)", "Odstraňte listy, které by byly ve vodě", "Chraňte před přímým sluncem a průvanem", "Ideální teplota: 18–22 °C"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Velmi jemné, lehce sladké, příjemné$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$179778298294$j$, $j$Jemný ranunculus s plnými, vrstvenými květy v krásném růžovém odstínu. Květy připomínají malé pivoňky, mají papírovitou strukturu a elegantní vzhled. Skvěle se hodí do romantických, svatebních i jemných jarních vazeb – dodává objem a něžnou barvu.$j$, $j$["Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 1–2 cm (stonky jsou tenké a choulostivé)", "Odstraňte všechny listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)", "Nejlepší výdrž mají květy řezané v barevném pupenu (soft marshmallow stage)"]$j$, $j$[{"title": null, "items": ["Postavte ihned do čisté vázy s"]}, {"title": null, "items": ["nbsp;vlažnou"]}]$j$, 14, 18, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$758183765004$j$, $j$Světle fialové husté klasy drobných květů na pevném stonku. Romantický a jemný vzhled s příjemnou sladkou vůní, která krásně provoní místnost. Skvěle se hodí do jarních a romantických vazeb, přináší do interiéru jemnost a eleganci.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu (husté klasy rychle znečišťují vodu)", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejraději chladnější místo)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Silná, kořená$j$, 3, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$137499940354$j$, $j$Romantický a jemný vzhled s příjemnou sladkou vůní, která krásně provoní místnost. Skvěle se hodí do jarních a romantických vazeb, přináší do interiéru jemnost a eleganci.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu (husté klasy rychle znečišťují vodu)", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejraději chladnější místo)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Silná, kořená$j$, 3, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$740404252364$j$, $j$Intenzivně modré husté klasy plné drobných voňavých kvítků. Klasický jarní hyacint s výraznou barvou a bohatým květenstvím. Skvěle voní a přináší do interiéru svěží jarní energii a hlubokou modrou barvu.$j$, $j$["Postavte ihned do čisté vázy se studenou vodou (hyacinty milují chlad)", "Vyměňujte vodu každý den (rychle znečišťují vodu)", "Každé 2 dny seřízněte stonek rovně nebo mírně šikmo o 1 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, teplým místem a průvanem (ideálně chladnější prostor do 20 °C)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$25–35 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Silná, sladká$j$, 3, $j$Mírně toxický při pozření$j$, $j$Obsahuje alkaloidy. Zvláště nebezpečný pro kočky a psy – držte mimo dosah.$j$),
  ($j$648914168684$j$, $j$Elegantní tmavě růžová kala s klasickým trychtýřovitým tvarem a výrazným květem. Kompaktní, moderní vzhled s bohatou barvou, která vypadá luxusně a zároveň jemně. Skvěle se hodí do minimalistických vazeb i jako dominantní prvek v kyticích.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejraději chladnější místo)"]$j$, $j$[]$j$, 8, 14, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Toxický při pozření$j$, $j$Obsahuje šťavelany. Držte mimo dosah koček a psů.$j$),
  ($j$588331244394$j$, $j$Elegantní tmavě růžová kala s klasickým trychtýřovitým tvarem a výrazným květem. Kompaktní, moderní vzhled s bohatou barvou, která vypadá luxusně a zároveň jemně. Skvěle se hodí do minimalistických vazeb i jako dominantní prvek v kyticích.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejraději chladnější místo)"]$j$, $j$[]$j$, 8, 14, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Toxický při pozření$j$, $j$Obsahuje šťavelany. Držte mimo dosah koček a psů.$j$),
  ($j$161047847644$j$, $j$Elegantní, klasická bílá kala s charakteristickým trychtýřovitým květem a jemně zeleným nádechem na konci. Italská odrůda je ceněna pro svůj velký, dokonale tvarovaný květ a luxusní vzhled. Působí velmi čistě, graficky a sofistikovaně — ideální pro moderní i romantické kompozice.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte všechny listy, které by byly ponořené ve vodě", "Každý den lehce oroste květ (kaly hodně pijí přes květenství)", "Chraňte před přímým sluncem a teplotami nad 22 °C (ideálně 15–20 °C)"]$j$, $j$[]$j$, 8, 14, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů + rozštěpení konce stonku$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Toxický při pozření$j$, $j$Obsahuje šťavelany. Držte mimo dosah koček a psů.$j$),
  ($j$842171548494$j$, $j$Něžné, vzdušné a velmi romantické bílé kustové gvozdíky s množstvím drobných kvítků na jedné větvičce. Jsou lehké, jemné a dodávají kompozicím vzdušnost, plnost a přirozený šarm. Skvěle se hodí jak do minimalistických, tak do bohatších aranžmá — vypadají čistě, svěže a elegantně.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ve vodě", "Každý den lehce oroste květy — mají rády vlhkost", "Chraňte před přímým sluncem a teplotami nad 22 °C (ideálně 15–20 °C)"]$j$, $j$[]$j$, 10, 18, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Sladce kořeněná, typicky karafiátová$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$784481462704$j$, NULL::text, $j$[]$j$, $j$[]$j$, 14, 18, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Sladce kořeněná, typicky karafiátová$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$475251790614$j$, $j$Klasická velká standardní gvozdika s plnými, hustě plněnými květy na dlouhém pevném stonku 70 cm. Intenzivní barva (Kino je typicky sytě červená), dobrá plnost květu a vysoká kvalita. Skvěle se hodí do velkých kytic, stojanů i samostatných vazeb – spolehlivá a dlouho vydržující květina.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu (karafiáty jsou citlivé na bakterie)", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm (nejlépe pod vodou)", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo 15–20 °C)"]$j$, $j$[]$j$, 14, 18, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Sladce kořeněná, typicky karafiátová$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$640521210934$j$, $j$Dlouhostopkatý karafiát s plnými, hustě plněnými květy na silném stonku 70 cm. Elegantní a bohatý vzhled s klasickým karafiátovým tvarem – skvěle drží tvar a barvu. Ideální pro velké kytice i samostatné vazby, kde potřebujete výšku a spolehlivost.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)"]$j$, $j$[]$j$, 10, 18, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$70–90 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Sladce kořeněná, hřebíčková.$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$705294410954$j$, $j$Kompaktní mini karafiát s drobnými, plnými květy sytě červené barvy. Intenzivní barva a bohaté květenství na kratším stonku. Skvěle se hodí do menších vazeb, doplňků kytic nebo jako výrazný barevný akcent – vypadá svěže a živě.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo)"]$j$, $j$[]$j$, 10, 15, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Sladce kořeněná, hřebíčková.$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$635994147514$j$, $j$Zajímavá zelená standardní gvozdika s plnými, hustě plněnými květy na dlouhém pevném stonku. Netradiční světle zelená barva dodává kyticím moderní, svěží a originální vzhled. Skvěle funguje jako kontrastní prvek v pestrobarevných vazbách nebo v minimalistických zeleno-bílých kompozicích.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu (karafiáty jsou citlivé na bakterie)", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm (nejlépe pod vodou)", "Odstraňte listy, které jsou ponořené ve vodě", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (nejlépe chladnější místo 15–20 °C)"]$j$, $j$[]$j$, 14, 18, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Jemna$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$377551986494$j$, $j$Výrazné, kulovité květenství s intenzivní fialovou barvou na vysokém pevném stonku. Allium je architektonická a dramatická květina, která dodává kompozicím moderní strukturu, výšku a zajímavou texturu. Jedna z nejsilnějších a nejoriginálnějších květin pro současné aranžmá.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2–3 dny a vždy důkladně umyjte vázu", "Každé 3 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ve vodě", "Chraňte před přímým sluncem a teplotami nad 23 °C", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 10, 15, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$2/3 délky stonku$j$, 2, $j$Rovný nebo mírně šikmý řez$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Toxický$j$, $j$Držte mimo dosah koček a psů.$j$),
  ($j$583912072744$j$, $j$Modrý delphinium (ostrožka) je majestátní řezaná květina s dlouhými, vzpřímenými klasy drobných květů v sytých odstínech modré, od nebesky světlé po hlubokou královskou modř. Dodává kompozicím výšku, vertikální dynamiku a nezaměnitelný zahradní, romantický charakter. Je oblíbenou volbou do svatebních vazeb, velkých váz i luxusních květinových instalací.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonky jsou duté, proto je můžete před aranžováním obrátit, naplnit vodou a zacpat vatou", "Každé 2–3 dny vyměňte vodu a vázu důkladně umyjte", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C", "Nedávejte do blízkosti zralého ovoce, delphinium je citlivé na etylen a rychle opadává", "Ideální teplota: 15–20 °C"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Jedovaté$j$, $j$Všechny části rostliny jsou toxické pro kočky, psy i lidi, umístěte mimo dosah$j$),
  ($j$110124804274$j$, $j$Velké, husté květenství v jemném růžovém odstínu. Elegantní a romantický vzhled s bohatým objemem. Skvěle vypadá v kyticích i samostatně – dodává vazbám měkkost, luxus a jarní svěžest.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu (hortenzie rychle znečišťují vodu)", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm pod vodou (aby se nedostal vzduch)", "Rozštěpte konec stonku na 4 části (asi 2–3 cm dlouho) – to výrazně zvyšuje příjem vody", "Odstraňte všechny listy, které jsou ponořené ve vodě", "Denně lehce oroste celé květenství (hortenzie hodně pijí přes květy)", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (ideálně 15–20 °C)", "Extra tip pro delší výdrž: Před vložením do vázy na 10–20 sekund ponořte konce stonků do horké vody (60–80 °C)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$90% délky stonku$j$, 3, $j$Šikmý řez na 45 stupňů + rozštěpení konce stonku$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá, téměř neutrální$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$217656894354$j$, $j$Velké, husté květenství v jemném světle modrém až modro-fialovém odstínu. Elegantní a svěží vzhled s výrazným objemem. Skvěle se hodí do moderních, romantických i chladně tónovaných vazeb – dodává kyticím lehkost, hloubku a luxusní dojem.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu (hortenzie rychle znečišťují vodu)", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm pod vodou (aby se nedostal vzduch)", "Rozštěpte konec stonku na 4 části (asi 2–3 cm dlouho) – to výrazně zvyšuje příjem vody", "Odstraňte všechny listy, které jsou ponořené ve vodě", "Denně lehce oroste celé květenství (hortenzie hodně pijí přes květy)", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (ideálně 15–20 °C)", "Extra tip pro delší výdrž: Před vložením do vázy na 10–20 sekund ponořte konce stonků do horké vody (60–80 °C)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$90% délky stonku$j$, 3, $j$Šikmý řez na 45 stupňů + rozštěpení konce stonku$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$220149625414$j$, $j$Velké, husté bílé květenství s jemným krémovým nádechem. Elegantní a svěží vzhled, který dodává kyticím objem, lehkost a čistotu. Skvěle funguje jako dominantní prvek ve velkých vazbách nebo samostatně – působí luxusně a romanticky.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu (hortenzie rychle znečišťují vodu)", "Každé 2–3 dny seřízněte stonek šikmo pod úhlem 2–3 cm pod vodou (aby se nedostal vzduch)", "Rozštěpte konec stonku na 4 části (asi 2–3 cm dlouho) – to výrazně zvyšuje příjem vody", "Odstraňte všechny listy, které jsou ponořené ve vodě", "Denně lehce oroste celé květenství (hortenzie hodně pijí přes květy)", "Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C (ideálně 15–20 °C)", "Extra tip pro delší výdrž: Před vložením do vázy na 10–20 sekund ponořte konce stonků do horké vody (60–80 °C)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$90% délky stonku$j$, 3, $j$Šikmý řez na 45 stupňů + rozštěpení konce stonku$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$972738031644$j$, $j$Jasná, velká a energická slunčnice s výraznými žlutými okvětními lístky a tmavým středem. Symbol léta, radosti, tepla a pozitivní energie. Je to jeden z nejsilnějších a nejvýraznějších prvků v aranžmá — okamžitě přitahuje pohled a dokáže rozzářit celou místnost.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 1–2 dny a vždy důkladně umyjte vázu", "Každé 2 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ponořené ve vodě", "Chraňte před přímým prudkým sluncem (ve váze rychleji vadnou)", "Ideální teplota: 18–23 °C"]$j$, $j$[{"title": null, "items": ["nbsp;Před vložením do vázy ponořte konce stonků na 15–20 sekund do horké vody (75–85 °C) a ihned poté do studené vody."]}]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$2/3 délky stonku$j$, 2, $j$Šikmý řez na 45 stupňů + rozštěpení konce stonku$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Jemna bylinná$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$407631212824$j$, $j$Něžné, drobné bílé romášky s jasně žlutým středem na větvičkách. Tyto malé kvítky působí velmi jemně, vzdušně a přirozeně — jako miniaturní kopretiny. Skvěle doplňují velké květy, dodávají kompozicím lehkost, romantiku a „divoký“ šarm louky.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 1–2 dny a vždy důkladně umyjte vázu", "Každé 2 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ve vodě", "Každý den lehce oroste kvítky — milují vlhkost", "Chraňte před přímým sluncem a teplotami nad 22 °C (ideálně 15–20 °C)"]$j$, $j$[]$j$, 8, 12, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 2$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Lehká, sladce květinová$j$, 2, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$716497270774$j$, $j$Unikátní, svěže zelená chryzantéma s kulatými nebo polokulovitými květy. Tato neobvyklá barva dodává kompozicím moderní, grafický a velmi svěží vzhled. Zelené chryzantémy jsou oblíbené pro svou originalitu, texturu a schopnost skvěle doplňovat jak pastelové, tak výrazné aranžmá.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ponořené ve vodě", "Každý den lehce oroste květy", "Chraňte před přímým sluncem a teplotami nad 23 °C (ideálně 15–20 °C)"]$j$, $j$[]$j$, 10, 15, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Jemna bylinná$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$127894464754$j$, $j$Svěží, aromatické větve eukalyptu s krásnými kulatými nebo srpkovitými listy. Dodává kompozicím přirozenou strukturu, objem, elegantní zelenou barvu a nádhernou vůni. Eukalyptus je oblíbený pro svou dlouhou výdrž a univerzálnost — skvěle se hodí jak do minimalistických, tak do bohatých aranžmá.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2–3 dny a vždy důkladně umyjte vázu", "Každé 3–4 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ponořené ve vodě", "Chraňte před přímým sluncem a teplotami nad 24 °C", "Ideální teplota: 15–22 °C"]$j$, $j$[]$j$, 14, 18, $j$edna z nejstálejších zelení · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$70–80 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Toxický při pozření$j$, $j$Držte mimo dosah koček a psů.$j$),
  ($j$486735324254$j$, $j$Něžná, elegantní a velmi romantická bílá eustoma s jemnými, vrstvenými okvětními lístky. Květy vypadají jako miniaturní růže a dodávají kompozicím vzdušnost, plnost a sofistikovaný vzhled. Patří mezi nejoblíbenější květiny pro svou dlouhou výdrž a jemnou krásu.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 2–3 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ponořené ve vodě", "Každý den lehce oroste květy — eustoma miluje vlhkost", "Chraňte před přímým sluncem a teplotami nad 22 °C (ideálně 15–20 °C)"]$j$, $j$[]$j$, 10, 15, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů + rozštěpení konce stonku$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Velmi jemné, lehce sladké, příjemné$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$632485843534$j$, $j$Exotický a velmi strukturovaný Leucadendron s tuhými, kuželovitými nebo růžicovitými květenstvími a krásnými barevnými listeny. Patří mezi nejunikátnější řezané květiny z Jižní Afriky. Dodává kompozicím moderní, architektonický a luxusní vzhled s výraznou texturou a dlouhou výdrží.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2–3 dny a vždy důkladně umyjte vázu", "Každé 3 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ponořené ve vodě", "Chraňte před přímým sluncem a teplotami nad 24 °C", "Ideální teplota: 15–22 °C"]$j$, $j$[]$j$, 10, 18, NULL::text, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$780332703944$j$, $j$Eryngium (máčka) je nezaměnitelná řezaná květina s ostnitými, chrpově kulatými květenstvími a bodlavými listeny v ocelově modré, fialové nebo stříbrné barvě. Působí drsně a přitom elegantně, proto dodává kompozicím výraznou strukturu, texturu a moderní, téměř sochařský charakter. Skvěle vypadá ve vázách i svatebních vazbách a po zaschnutí zůstává dekorativní i jako sušená květina.$j$, $j$["Před aranžováním noste rukavice, listeny jsou ostré", "Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Stonek seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené", "Vodu vyměňujte každé 2–3 dny a vázu vždy důkladně umyjte", "Nedávejte příliš vysoko vodu, stačí zhruba třetina délky stonku", "Chraňte před přímým sluncem a teplotami nad 24 °C", "Ideální teplota: 15–22 °C", "Chcete-li květiny sušit, pověste je hlavou dolů na suchém, tmavém a vzdušném místě"]$j$, $j$[]$j$, 10, 18, NULL::text, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$50–65 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Ostnité, opatrně$j$, $j$Květiny nejsou známé jako výrazně toxické, ale ostré listeny mohou zranit tlamičku$j$),
  ($j$940778073744$j$, $j$Exotická a fascinující Leucospermum, známá také jako „jehelníček“ nebo Pincushion Protea. Květy připomínají barevné polštářky plné jemných jehliček — jsou strukturované, odvážné a nesmírně dekorativní. Dodávají kompozicím moderní exotický charakter, texturu a výrazný vizuální efekt.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2–3 dny a vždy důkladně umyjte vázu", "Každé 3 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ponořené ve vodě", "Chraňte před přímým sluncem a teplotami nad 24 °C", "Ideální teplota: 15–22 °C"]$j$, $j$[]$j$, 10, 16, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Šikmý řez na 45 stupňů$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$713060849694$j$, NULL::text, $j$[]$j$, $j$[]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text),
  ($j$179280018114$j$, $j$Exotická, velkolepá a architektonická protea s výraznými, kožovitými květními hlavami. Patří mezi nejunikátnější řezané květiny na světě. Každý květ vypadá jako umělecké dílo — robustní, strukturovaný a fascinující. Protea dodává kompozicím dramatický charakter, luxus a moderní exotický nádech.$j$, $j$["Postavte ihned do čisté vázy s vlažnou vodou (18–22 °C)", "Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu", "Každé 3 dny seřízněte stonek šikmo pod vodou (úhel 45°)", "Odstraňte spodní listy, které by byly ve vodě", "Chraňte před přímým sluncem a teplotami nad 24 °C", "Ideální teplota: 15–22 °C"]$j$, $j$[]$j$, 10, 16, $j$Patří mezi stálé řezané květiny s dobrou výdrží. · 3$j$, $j$1/3 délky stonku$j$, 1, $j$Rovný nebo mírně šikmý řez$j$, $j$45–50 cm$j$, $j$Přibližná výška, může se mírně lišit podle podmínek$j$, $j$Slabá až neutrální$j$, 1, $j$Mírně toxický při pozření$j$, $j$Může způsobit zažívací potíže. Raději držte mimo dosah koček a psů.$j$),
  ($j$875039819364$j$, $j$Něžný, romantický a velmi sofistikovaný set v jemné paletě růžové, světle fialové a mátově-fialové. Tato kombinace působí snově, elegantně a žensky — jako letní soumrak nebo probouzející se zahrada. Květiny se krásně doplňují a vytvářejí bohatou, ale vzdušnou kompozici plnou něhy a elegance.$j$, $j$["10 ks světle fialových / mátově fialových matthiol", "10 ks růžových pivoňek (Sarah Bernhardt/Klasické růžové)", "10 ks růžovo-fialových kal (Calla Lily/Calla Zazu)"]$j$, $j$[{"title": null, "items": ["nbsp;přibližně 50–70 cm\nProč tento set milujeme:\nRůžové pivoňky jsou hlavní hvězdou — velké, nadýchané a plné romantiky. Světle fialové matthioly přinášejí jemnou mátovou eleganci a hloubku, zatímco růžovo-fialové kaly dodávají grafický tvar a moderní akcent. Společně vytvářejí velmi harmonickou, vzdušnou a luxusní kompozici v trendy „dusty“ paletě."]}]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text),
  ($j$984843790224$j$, $j$Romantický, jemný a velmi vzdušný set v korálově-bílé paletě. Kombinace velkých nadýchaných pivoňek, klasických sedmikrásek a voňavých bílých matiol vytváří kompozici plnou něhy, svěžesti a jemné elegance. Tento set působí jako jarní nebo raně letní sen — lehký, romantický a zároveň luxusní.$j$, $j$["10 ks korálových pivoňek (Coral Charm)", "25 ks bílých sedmikrásek (Daisy/Tanacetum)", "10 ks bílých matiol (Matthiola / Levkoj)"]$j$, $j$[]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text),
  ($j$429725654764$j$, $j$Kafka je komplet ze tří samostatných náručí, každé po deseti stoncích: lososové růže Priscilla, vínový amarant Rosary s převisajícími střapci a zelený hypericum se svěžími bobulemi. Teplý podzim bez zbytečného patosu. Paleta lososová, vínová a zelená působí měkce, útulně a přitom moderně. Každou květinu můžete dát do vlastní vázy, nebo je spojit do jedné bohaté kytice. Možné doručení bez krabice.

Složení → 10× růže Priscilla, 10× amarant Rosary, 10× hypericum zelený$j$, $j$[]$j$, $j$[{"title": null, "items": ["Každou náruč rozbalte zvlášť a postavte ihned do čisté vázy s vlažnou vodou (18–22 °C) Stonky seřízněte šikmo pod vodou (úhel 45°) a odstraňte spodní listy, které by byly ponořené U růží odstraňte i trny, které by mohly poranit ruce nebo stonek Vodu vyměňujte každé 2–3 dny a vázy vždy důkladně umyjte\nAmarant má měkké stonky s těžkými střapci, proto mu dopřejte dostatek vody a vyšší vázu Chraňte před přímým sluncem, průvanem, topením a teplotami nad 22 °C Nedávejte do blízkosti zralého ovoce, které uvolňuje etylen a urychluje vadnutí"]}]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text),
  ($j$533579528704$j$, $j$Jasný, veselý a energický set plný slunce a pozitivní energie. Kombinace velkých žlutých podslunečníků, svěže zelených gvozdíků Kiwi a drobných zlatých kuliček Craspedia vytváří kompozici, která vypadá jako letní louka zachycená v váze — živou, optimistickou a plnou života.$j$, $j$["10 ks podslunečníků (Sunflowers)", "10 ks Karafiatů Kiwi (Kiwi Carnation)", "4 ks Nutan / Leucospermum (zlaté kuličky)"]$j$, $j$[]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text),
  ($j$433899122534$j$, $j$Čistá, sofistikovaná a velmi elegantní kombinace tří bílých květin, která působí luxusně, romanticky a zároveň moderně. Tento set je ideální pro ty, kteří milují minimalistickou bílou paletu a chtějí doma vytvořit velkou, vzdušnou a dlouhotrvající kompozici.$j$, $j$["10 ks bílých kal (Calla Lily)", "10 ks bílých eustom (Lisianthus)", "10 ks bílých heřmanků (Spray Carnation)"]$j$, $j$[]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text),
  ($j$378944187904$j$, $j$Malá květinová kompozice v plechovce je ručně sestavená z čerstvých květin, které jsou zapíchnuté do květinové pěny. Působí jemně, osobitě a útulně, proto se hodí jako malý dárek, dekorace na stůl, parapet nebo poděkování. Složení květin se může mírně lišit podle aktuální nabídky, barevné ladění a styl kompozice ale zůstávají zachovány.$j$, $j$[]$j$, $j$[]$j$, NULL::int, NULL::int, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::text, NULL::text)
) as v(uid, description, care, extra, vmin, vmax, vnote, water, wlevel, cut, height, hnote, scent, slevel, pet, pnote)
join public.product_stickers ps on ps.tilda_uid = v.uid
on conflict (product_id) do nothing;

-- genus, role and tool for every flower product (rule table above; edit per product in the manager)
insert into public.product_cards (product_id, genus, role, tool)
select ps.id, g.key,
       case when g.role = 'focal' and norm_name(ps.product_name) ~ '(spray|mini)' then 'filler' else g.role end,
       g.tool
  from public.product_stickers ps
  join lateral (select x.* from public.flower_genus x where norm_name(ps.product_name) ~ x.pattern order by x.sort limit 1) g on true
 where ps.archived = false and ps.category = 'ohapka' and ps.product_name <> '__default__'
on conflict (product_id) do update
   set genus = coalesce(public.product_cards.genus, excluded.genus),
       role  = coalesce(public.product_cards.role,  excluded.role),
       tool  = coalesce(public.product_cards.tool,  excluded.tool);

-- accessories shown under "Dokončete kytici" (uid = Tilda product uid; add designer vases here with kind = vase)
insert into public.product_accessories (tilda_uid, kind, name, price, image_url, tone, sort) values
  ($j$420306073564$j$, $j$secateur$j$, $j$Jednočepelové nůžky$j$, 110, $j$https://static.tildacdn.com/stor3538-3662-4963-b030-613436393733/73dc32fa9d0322ccf1c7f96b2c1c6d64.webp$j$, NULL::text, 10),
  ($j$978807406694$j$, $j$scissors$j$, $j$Přečepelové nůžky$j$, 110, $j$https://static.tildacdn.com/stor6162-6463-4431-a230-636563653531/e389787a107b83ed6c1246042f6d7fa9.webp$j$, NULL::text, 20),
  ($j$115899135364$j$, $j$kenzan$j$, $j$Kenzan Ø 6сm$j$, 300, $j$https://static.tildacdn.com/stor3030-3734-4361-a539-316434366261/04e733c3b9c84c768159979e213881ad.webp$j$, NULL::text, 30),
  ($j$177311464364$j$, $j$kenzan$j$, $j$Kenzan 5.5cm x 3.8cm$j$, 340, $j$https://static.tildacdn.com/stor3064-3237-4636-b862-346432393262/ff04644ddecc4453d2136f6883ba0920.webp$j$, NULL::text, 31),
  ($j$986779895264$j$, $j$kenzan_care$j$, $j$Čistící kartáček pro kenzan$j$, 160, $j$https://static.tildacdn.com/stor6631-3863-4863-a463-623465353938/42b48e00afe2ffbf90d65b8bfc62a90a.webp$j$, NULL::text, 40),
  ($j$776369898234$j$, $j$kenzan_care$j$, $j$Rovnátko na jehly pro kenzan$j$, 100, $j$https://static.tildacdn.com/stor3537-3438-4131-a333-353230346264/b9f840382d1aae791cfb35632b26b1b0.webp$j$, NULL::text, 41),
  ($j$743428321314$j$, $j$vase_low$j$, $j$Vaza 7.5x16 cm pro kenzan$j$, 290, $j$https://static.tildacdn.com/stor3039-3765-4433-a639-306135386337/6a2347825245a331c01f0394223dbdcf.webp$j$, NULL::text, 50),
  ($j$158611577824$j$, $j$postcard$j$, $j$Pohlednice Modrá$j$, 40, $j$https://static.tildacdn.com/stor6233-3636-4433-b765-383761383638/8a5ac3a015e477aada6514480f2675f0.jpg$j$, $j$cool$j$, 60),
  ($j$339564285354$j$, $j$postcard$j$, $j$Pohlednice Růžová$j$, 40, $j$https://static.tildacdn.com/stor3230-6438-4039-b762-626564643934/e9576279a57c5d137f21921252a81888.jpg$j$, $j$warm$j$, 61)
on conflict (tilda_uid) do nothing;

-- old spellings from early orders -> current product (statistics see through the old names)
insert into public.order_name_map (old_name, product_id)
select m.old_name, ps.id from (values
  ($j$růže bombastik$j$, $j$Růže Bombastik spray$j$),
  ($j$pivoňka koralová$j$, $j$Pivoňka Coral Charm$j$),
  ($j$calla fialová$j$, $j$Kala Zazu$j$),
  ($j$pivoňka růžová$j$, $j$Pivoňka Sarah Bernard$j$),
  ($j$kala zazu kornoutovka$j$, $j$Kala Zazu$j$),
  ($j$karafiat červený mini$j$, $j$Karafiat červený (mini)$j$),
  ($j$lilie růžová$j$, $j$Lilie růžová mix$j$),
  ($j$matthiola pink$j$, $j$Matthiola růžová$j$),
  ($j$peony sarah bernard$j$, $j$Pivoňka Sarah Bernard$j$),
  ($j$pivoňka červená dark$j$, $j$Pivoňka Red Charm$j$),
  ($j$white peony$j$, $j$Pivoňka bílá$j$),
  ($j$дельфиниум синий$j$, $j$Delphinium modrý$j$),
  ($j$розовая гвоздика$j$, $j$Karafiát růžový$j$)
) as m(old_name, cur)
join public.product_stickers ps on ps.archived = false and decode_html_entities(ps.product_name) = m.cur
on conflict (old_name) do nothing;

select public.refresh_product_co_purchase();

commit;
