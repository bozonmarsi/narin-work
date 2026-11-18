-- Рекомендации в окне товара: щётка и выпрямитель для кензана теперь тоже приходят на сайт.
-- Окно само решает, кому их показывать (только любителям-флористам), подаркам они не мешают.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_product_card_bundle'::regproc);
  n := replace(d, 'where a.active and a.kind <> ''kenzan_care''', 'where a.active');
  n := replace(n, 'n.kind not in (''kenzan_care'', ''postcard'')', 'n.kind <> ''postcard''');
  if n = d then raise exception 'get_product_card_bundle: pattern not found'; end if;
  execute n;
end $$;
