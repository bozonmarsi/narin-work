-- Разовая чистка мусора, накопившегося от одного неудачного ручного
-- запуска vanvliet-alias-refresh (12.09.2026 07:38) — модель тогда
-- перепутала род растения (пионы -> розы/дельфиниум/георгины, тюльпаны
-- -> розы/гербера, аллиум -> ирис, калла -> эустома, гиацинт ->
-- гортензия, нарцисс -> орнитогалум). Плановый прогон 15.09 исправил
-- только то, для чего в тот день реально было совпадение в каталоге —
-- остальное осталось висеть неисправленным (см. правку самой функции:
-- 20260918030000 больше так делать не даст). Каждая пара ниже сверена
-- напрямую с живым каталогом Van Vliet перед удалением.
delete from product_name_aliases pna
using product_stickers ps, suppliers s
where pna.product_sticker_id = ps.id
  and pna.supplier_id = s.id
  and s.name = 'Van Vliet'
  and (ps.product_name, pna.alias) in (
    ('Allium fialový', 'Iris blue magic'),
    ('Calla fialov&aacute;', 'Eust (dbl) blue chateau'),
    ('Hyacint modr&yacute;', 'Hydraenga macr verena'),
    ('Narcis 32cm', 'Ornit t mount fuji'),
    ('Pivoňka bil&aacute;', 'Delph elatum pure w'),
    ('Pivoňka červen&aacute; dark', 'Dahlia Heatwave'),
    ('Pivoňka Coral Charm', 'Rosa tr madam bombastic'),
    ('Pivoňka koralov&aacute;', 'Rosa tr summer rose'),
    ('Pivoňka Red Charm', 'Rosa tr bombastic'),
    ('Pivoňka růžov&aacute;', 'Rosa tr summer rose'),
    ('Ranunculus b&iacute;l&yacute;', 'Delph elatum pure w'),
    ('Ranunculus růžov&yacute;', 'Rosa tr summer rose'),
    ('Ranunculus růžový', 'Rosa tr summer rose'),
    ('Tulipan růžov&yacute;', 'Rosa tr julieta ho'),
    ('Tulipan růžov&yacute;', 'Rosa tr madam bombastic'),
    ('Tulipan růžov&yacute;', 'Rosa tr summer rose'),
    ('Tulipan růžov&yacute;', 'Rosa tr kate-lynn pink'),
    ('Tulipan růžový', 'Gerbera mi picco livorno'),
    ('White peony', 'Delph elatum pure w')
  );
