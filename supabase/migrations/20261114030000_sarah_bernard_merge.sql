-- Sarah Bernhardt peony existed twice:
--   "Pivoňka Sarah Bernard"  - the real Tilda product (uid 548551220284) + its site card,
--                              but ARCHIVED, so the shop did not know it (no stock logic, no Van Vliet link);
--   "Peony Sarah Bernard"    - an active duplicate with the Van Vliet names and stock flag,
--                              but no Tilda uid and no price.
-- Keep the real one: bring it back, give it the Van Vliet names and stock status, archive the duplicate.
-- (the duplicate has no recipes, batches or purchases - checked.)

update product_stickers
   set archived = false,
       vanvliet_in_stock = (select vanvliet_in_stock from product_stickers where id = '22f28c27-4f61-4915-b41d-786b2c86289b'),
       vanvliet_stock_checked_at = (select vanvliet_stock_checked_at from product_stickers where id = '22f28c27-4f61-4915-b41d-786b2c86289b')
 where id = '72ad19c1-7dd2-4178-ac62-a595d0429fa1';

update product_name_aliases
   set product_sticker_id = '72ad19c1-7dd2-4178-ac62-a595d0429fa1'
 where product_sticker_id = '22f28c27-4f61-4915-b41d-786b2c86289b';

update product_stickers set archived = true where id = '22f28c27-4f61-4915-b41d-786b2c86289b';

select s.product_name, s.archived, s.vanvliet_in_stock, s.tilda_uid,
       (select string_agg(alias, ' ; ') from product_name_aliases a where a.product_sticker_id = s.id) aliases
  from product_stickers s where s.id in ('22f28c27-4f61-4915-b41d-786b2c86289b', '72ad19c1-7dd2-4178-ac62-a595d0429fa1');
