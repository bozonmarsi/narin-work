-- Card editor in the manager app + a mixed "Často kupují spolu" rail.
--  * product_cards.extra_images: photos added in the editor, shown after the Tilda gallery;
--  * a stabilized flower gets no genus tips: a fresh rose tip about water would be wrong for it;
--  * the rail x now carries the product category and stabilized flowers (kind 'stabilized'),
--    so the popup can alternate care items, gifts and stabilized flowers.

alter table public.product_cards add column if not exists extra_images jsonb not null default '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.get_product_card_bundle()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with prod as (
  select ps.id, ps.tilda_uid as uid, decode_html_entities(ps.product_name) as name, ps.price, ps.category,
         coalesce(pc.images ->> 0, ps.image_url) as img, ps.color, ps.special_order, ps.order_unit_size,
         coalesce(pc.role, g.role) as role, pc.status, pc.updated_at,
         pc.product_id is not null as has_card,
         coalesce(pc.tool, g.tool, 'scissors') as tool,
         coalesce(g.low_vase, false) or ps.height = 'Nízké' as low,
         case when ps.category = 'stabilizovane' then pc.highlights else coalesce(pc.highlights, g.highlights) end as hl,
         pc.images, pc.tone
    from product_stickers ps
    left join product_cards pc on pc.product_id = ps.id
    left join flower_genus g on g.key = coalesce(pc.genus,
         (select x.key from flower_genus x where norm_name(ps.product_name) ~ x.pattern order by x.sort limit 1))
   where ps.archived = false and not coalesce(ps.manually_hidden, false)
     and ps.tilda_uid is not null and ps.product_name <> '__default__'
),
acc as (
  -- curated accessories: on unless the sticker is hidden or archived, or Tilda has switched them off
  select a.tilda_uid as uid, a.kind, a.name, coalesce(cp.price, a.price) as price,
         coalesce(a.image_url, nullif(s.image_url, '')) as img, a.tone, a.sort, s.category as cat
    from product_accessories a
    left join catalog_prices cp on cp.uid = a.tilda_uid
    left join lateral (select * from product_stickers x where x.tilda_uid = a.tilda_uid
                        order by x.manually_hidden desc limit 1) s on true
   where a.active and a.kind <> 'kenzan_care'
     and coalesce(cp.active, true) and not coalesce(s.manually_hidden, false) and not coalesce(s.archived, false)
  union all
  -- new products of Atelier, Darky and the stabilized flowers, as soon as Tilda has them
  select cp.uid, n.kind, decode_html_entities(s.product_name), cp.price, nullif(s.image_url, ''), null::text, 500, s.category
    from product_stickers s
    join catalog_prices cp on cp.active
         and (cp.uid = s.tilda_uid or (s.tilda_uid is null and decode_html_entities(cp.title) = decode_html_entities(s.product_name)))
    cross join lateral (select case when s.category = 'stabilizovane' then 'stabilized'
                                    else accessory_kind(decode_html_entities(s.product_name)) end as kind) n
   where s.category in ('atelier', 'darky', 'stabilizovane') and s.archived = false and not s.manually_hidden
     and n.kind not in ('kenzan_care', 'postcard')
     and not exists (select 1 from product_accessories a where a.tilda_uid = cp.uid)
)
select json_build_object(
  'v', (select coalesce(max(extract(epoch from updated_at))::bigint, 0) from prod)::text
       || '-' || (select count(*) from product_recs)::text
       || '-' || (select coalesce(extract(epoch from max(updated_at))::bigint, 0) from rec_settings)::text
       || '-' || (select md5(coalesce(string_agg(uid || ':' || coalesce(price::text, ''), ',' order by uid), '')) from acc),
  'p', (select json_object_agg(uid, json_build_object('n', name, 'pr', price, 'img', img, 'c', color, 'r', role,
                 'so', special_order, 'u', order_unit_size, 'k', category)) from prod),
  'k', (select json_object_agg(p.uid, (to_jsonb(c) - 'product_id' - 'updated_at' - 'status' - 'images' - 'highlights' - 'source')
                 || jsonb_build_object('hl', coalesce(p.hl, '[]'::jsonb), 'im', coalesce(p.images, '[]'::jsonb), 'tool', p.tool, 'low', p.low))
          from prod p join product_cards c on c.product_id = p.id where c.status = 'ready'),
  'r', (select json_object_agg(uid, recs) from (
          select b.uid, json_agg(json_build_array(c.uid, r.role, r.score, r.reason) order by r.score desc) as recs
            from product_recs r join prod b on b.id = r.product_id join prod c on c.id = r.rec_id
           group by b.uid) t),
  'x', (select coalesce(json_agg(json_build_object('uid', uid, 'kind', kind, 'n', name, 'pr', price,
                 'img', img, 'tone', tone, 'cat', cat) order by sort, name), '[]'::json) from acc)
);
$function$;
