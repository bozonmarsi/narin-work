-- Раньше состав сета мог ссылаться только на наш собственный товар
-- (ingredient_sticker_id). Но иногда для сета нужен конкретный цветок,
-- который есть у Van Vliet, а отдельным товаром-охапкой у нас заводить
-- его не хотят (это разовая/редкая позиция, не нужно тащить её в общий
-- каталог с категориями/тегами) — тогда состав ссылается просто на
-- название из прайс-листа Van Vliet, без своего товара вообще.
alter table product_recipes alter column ingredient_sticker_id drop not null;
alter table product_recipes add column if not exists vanvliet_ingredient_name text;

alter table product_recipes drop constraint if exists product_recipes_ingredient_source_check;
alter table product_recipes add constraint product_recipes_ingredient_source_check
  check ((ingredient_sticker_id is not null) <> (vanvliet_ingredient_name is not null));

comment on column product_recipes.vanvliet_ingredient_name is
  'Название из каталога Van Vliet — заполнено вместо ingredient_sticker_id, когда в составе нужен цветок, у которого нет своего товара в нашей базе (без учёта остатка, без своей карточки).';
