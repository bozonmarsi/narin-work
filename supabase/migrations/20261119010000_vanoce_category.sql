-- Сезонная категория «Vánoce» (венки, позже амариллисы и т.п.).
-- Наличие считается по количеству, как у Kovky и Букетов: quantity > 0 = «Doručíme dnes».
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_catalog_page_data'::regproc);
  n := replace(d, '(''banky'', ''buket'')', '(''banky'', ''buket'', ''vanoce'')');
  if n = d then raise exception 'get_catalog_page_data: pattern not found'; end if;
  execute n;
end $$;

-- Первый товар: Věnec Houpací koník (Tilda uid 895726974854, 790 Kč, Ø 30 cm, závěsný)
insert into product_stickers (product_name, image_url, tilda_uid, tilda_url, category, price, quantity, order_unit_size, added_to_tilda, manually_hidden)
select 'Věnec Houpací koník', 'https://static.tildacdn.com/tila6434-3966-4530-b739-333839386439/venec-1.webp', '895726974854',
       'https://vezminarin.cz/tproduct/895726974854', 'vanoce', 790, 0, 1, true, false
where not exists (select 1 from product_stickers where tilda_uid = '895726974854');
