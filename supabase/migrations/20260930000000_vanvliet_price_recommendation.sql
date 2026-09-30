-- Подсказка по цене: менеджер сам решает наценку (коэффициент), но
-- берёт её от самой дешёвой актуальной цены этого цветка у Van Vliet
-- (не от вручную вбитой один раз себестоимости — её почти никогда не
-- заполняют на Приёмке, см. product_stickers.price / batches). Коэффициент
-- разный у разных цветов (флорист явно просил не один общий множитель),
-- поэтому это отдельное поле на каждый товар, а не константа в коде.
alter table product_stickers add column if not exists vanvliet_cheapest_price numeric;
alter table product_stickers add column if not exists price_markup_multiplier numeric not null default 2.5;

comment on column product_stickers.vanvliet_cheapest_price is
  'Самая низкая цена среди актуальных (сегодня в наличии) соответствий Van Vliet для этого цветка — за штуку. Обновляет vanvliet-stock-scan вместе с vanvliet_in_stock.';
comment on column product_stickers.price_markup_multiplier is
  'Личный коэффициент наценки менеджера для рекомендуемой цены (vanvliet_cheapest_price * price_markup_multiplier, округлено до 10) — разный у разных цветов, не общий на все.';
