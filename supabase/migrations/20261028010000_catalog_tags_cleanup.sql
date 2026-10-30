-- Catalog tags cleanup: fill the EMPTY colour / flower-type tags and archive one duplicate.
--
-- WHY: 39 of 66 flowers had no colour and 38 had no flower type, so the filter bar on the home page
-- and the recommendations ("Ladí k tomu") could not work for most of the catalog. Colours below were
-- set by looking at the product photos. ONLY EMPTY tags are filled: anything you set by hand is kept.
-- Heights are NOT touched (you fill them yourself).
--
-- Safe to re-run. Reverse: set color / flower_type back to NULL for the listed products, or
-- update product_stickers set archived = false where product_name = 'Karafi&aacute;t bil&yacute; spray'.

begin;

-- 1) the same product existed twice: "Karafiát bílý spray" (no price, no Tilda link) and
--    "Karafiát bilý (spray)" (the live one). Archive the empty one.
update product_stickers d
   set archived = true
 where d.product_name = 'Karafi&aacute;t bil&yacute; spray'
   and d.tilda_uid is null and d.price is null
   and exists (select 1 from product_stickers k
                where k.archived = false and decode_html_entities(k.product_name) = 'Karafiát bilý (spray)');

-- 2) colours (only where empty). Vocabulary: Bílá, Růžová, Červená, Žlutá, Fialová, Modrá, Zelená.
update product_stickers ps
   set color = v.colors
  from (values
    ('Chryzantéma zelená', array['Zelená']),
    ('Dahlia bilá',        array['Bílá']),
    ('Dahlia bordo',       array['Červená']),
    ('Dahlia caitlins',    array['Růžová']),
    ('Dahlia queen',       array['Růžová']),
    ('Dahlia sunny boy',   array['Žlutá']),
    ('Delphinium modrý',   array['Modrá']),
    ('Eryngium',           array['Modrá']),
    ('Eukalyptus',         array['Zelená']),
    ('Freesia bilá',       array['Bílá']),
    ('Fressia červená',    array['Červená']),
    ('Fressia žlutá',      array['Žlutá']),
    ('Gerbera Claudemir',  array['Žlutá']),
    ('Gerbera cream springs', array['Bílá']),
    ('Gerbera Magic',      array['Růžová']),
    ('Gerbera Mayball',    array['Růžová']),
    ('Gerbera Stich',      array['Růžová']),
    ('Heřmánek',           array['Bílá']),
    ('Karafiát burgundi',  array['Červená']),
    ('Karafiát bilý (spray)', array['Bílá']),
    ('Karafiat červený (mini)', array['Červená']),
    ('Karafiat Kino',      array['Červená']),
    ('Karafiat Kiwi',      array['Zelená']),
    ('Leucadendron',       array['Červená']),
    ('Moluccella',         array['Zelená']),
    ('Pivoňka Coral Charm', array['Růžová','Červená']),
    ('Pivoňka Red Charm',  array['Červená']),
    ('Pivoňka Sarah Bernard', array['Růžová']),
    ('Protea',             array['Růžová']),
    ('Ranunculus bílý',    array['Bílá']),
    ('Ranunculus růžový',  array['Růžová']),
    ('Slunečnice',         array['Žlutá']),
    ('Tulipan bilý',       array['Bílá']),
    ('Tulipan růžový',     array['Růžová'])
  ) as v(name, colors)
 where ps.archived = false
   and decode_html_entities(ps.product_name) = v.name
   and (ps.color is null or cardinality(ps.color) = 0);

-- 3) flower type, only the types the site filter already knows (Tulipán, Ranunkulus, Pivoňka,
--    Karafiát, Hortenzie, Exotika); only where empty.
update product_stickers ps
   set flower_type = v.types
  from (values
    ('Tulipan bilý',          array['Tulipán']),
    ('Tulipan růžový',        array['Tulipán']),
    ('Ranunculus bílý',       array['Ranunkulus']),
    ('Ranunculus růžový',     array['Ranunkulus']),
    ('Hortenezie bilá',       array['Hortenzie']),
    ('Pivoňka Red Charm',     array['Pivoňka']),
    ('Karafiát bilý (spray)', array['Karafiát']),
    ('Karafiat červený (mini)', array['Karafiát']),
    ('Protea',                array['Exotika'])
  ) as v(name, types)
 where ps.archived = false
   and decode_html_entities(ps.product_name) = v.name
   and (ps.flower_type is null or cardinality(ps.flower_type) = 0);

commit;
