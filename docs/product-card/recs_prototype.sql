-- Prototype of the "Ladí k tomu" (pairs well) ranking. READ-ONLY: runs as a plain SELECT.
-- Replace 'Pivoňka Sarah Bernard' below to preview another product.
with
p as (
  select ps.id, ps.product_name, ps.category, ps.price, ps.height, ps.special_order, ps.force_tomorrow,
         ps.quantity, ps.color, ps.manually_hidden, ps.archived, ps.vanvliet_in_stock,
         lower(translate(decode_html_entities(ps.product_name),'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ','acdeeinorstuuyzacdeeinorstuuyz')) as n
  from product_stickers ps
  where ps.archived = false and ps.category = 'ohapka' and ps.product_name <> '__default__'
),
g as (   -- genus + role from the name (the same table will later live in flower_genus)
  select p.*,
    case
      when n ~ 'pivon' then 'pivonka'      when n ~ 'ruze' then 'ruze'
      when n ~ 'horten' then 'hortenzie'   when n ~ 'dahlia' then 'dahlia'
      when n ~ 'gerbera' then 'gerbera'    when n ~ 'karafi' then 'karafiat'
      when n ~ 'tulip' then 'tulipan'      when n ~ 'ranunc' then 'ranunculus'
      when n ~ 'eustoma' then 'eustoma'    when n ~ '(kala|calla)' then 'kala'
      when n ~ '(freesia|fressia)' then 'freesia' when n ~ 'matthiola' then 'matthiola'
      when n ~ 'allium' then 'allium'      when n ~ 'delphin' then 'delphinium'
      when n ~ 'eukalypt' then 'eukalyptus' when n ~ 'moluc' then 'moluccella'
      when n ~ 'eryngium' then 'eryngium'  when n ~ 'hermanek' then 'hermanek'
      when n ~ 'leucadendron' then 'leucadendron' when n ~ 'leucosp' then 'leucospermum'
      when n ~ 'protea' then 'protea'      when n ~ 'anturi' then 'anturium'
      when n ~ 'amarylis' then 'amarylis'  when n ~ 'slunecn' then 'slunecnice'
      when n ~ 'chryzant' then 'chryzantema' when n ~ 'hyacint' then 'hyacint'
      when n ~ 'lili' then 'lilie'         when n ~ 'magnol' then 'magnolie'
      when n ~ 'nerine' then 'nerine'      else 'other' end as genus,
    case
      when n ~ '(spray|mini|matthiola|freesia|fressia|hermanek)' then 'filler'
      when n ~ '(eukalypt|moluc|leucadendron|eryngium)' then 'greenery'
      when n ~ '(allium|delphin|kala|nerine|hyacint|magnol)' then 'accent'
      else 'focal' end as role,
    case
      when n ~ '(bil|white|cream|krem)' then 'white'
      when n ~ '(ruzov|pink|coral|koral|mama|novia|bombastik)' then 'pink'
      when n ~ '(cerven|red|bordo|burgund|ferrari)' then 'red'
      when n ~ '(fialov|purple|zazu)' then 'purple'
      when n ~ '(modr|blue)' then 'blue'
      when n ~ '(zlut|sunny|slunecn)' then 'yellow'
      when n ~ '(zelen|eukalypt|moluc|leucadendron|kiwi)' then 'green'
      else coalesce(lower(translate(color[1],'áčďéěíňóřšťúůýž','acdeeinorstuuyz')),'mix') end as fam
  from p
  where not p.manually_hidden
),
base as (select * from g where product_name = decode_html_entities('Pivoňka Sarah Bernard') or decode_html_entities(product_name)='Pivoňka Sarah Bernard' limit 1),
cand as (
  select c.*,
    -- 1) roles: a focal flower wants a filler and greenery most, another focal/accent less
    case when b.role='focal'   then case c.role when 'filler' then 3.0 when 'greenery' then 2.6 when 'accent' then 1.6 when 'focal' then 1.2 end
         when b.role='filler'  then case c.role when 'focal' then 3.0 when 'greenery' then 2.0 when 'accent' then 1.5 when 'filler' then 0.3 end
         when b.role='greenery'then case c.role when 'focal' then 3.0 when 'filler' then 2.0 when 'accent' then 1.5 when 'greenery' then 0.2 end
         else case c.role when 'focal' then 2.5 when 'greenery' then 2.0 when 'filler' then 2.0 else 0.8 end end as s_role,
    -- 2) colour harmony: neutrals match everything, analogous families match, same family is fine
    case when c.fam in ('white','green') or b.fam in ('white','green') then 2.0
         when c.fam=b.fam then 1.4
         when (b.fam,c.fam) in (('pink','red'),('red','pink'),('pink','purple'),('purple','pink'),('purple','blue'),('blue','purple'),('yellow','red'),('red','yellow')) then 1.6
         else 0.3 end as s_color,
    -- 3) height contrast: tall + low looks layered
    case when b.height is not null and c.height is not null and b.height <> c.height then 0.6 else 0 end as s_height,
    -- 4) delivery together: same availability class ships together, special order delays the whole basket
    case when c.special_order = b.special_order then 1.0 when c.special_order and not b.special_order then -2.0 else 0.2 end as s_ship,
    (c.genus = b.genus) as same_genus
  from g c cross join base b
  where c.id <> b.id and c.genus <> 'other'
)
select product_name, genus, role, fam, special_order as po,
       round((s_role + s_color + s_height + s_ship + case when same_genus then -1.5 else 0 end)::numeric,2) as score,
       s_role, s_color, s_height, s_ship, same_genus
from cand
order by score desc, product_name
limit 12;
