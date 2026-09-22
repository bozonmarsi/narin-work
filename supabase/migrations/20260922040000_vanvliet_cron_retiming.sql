-- Van Vliet не привозит цветы в понедельник — первая свежая партия за
-- неделю приходит во вторник рано утром (~6-7ч), и неизвестно точно, в
-- какой момент после этого у них обновляется сайт. Раз точное время
-- неизвестно — не гадаем, а чаще проверяем остаток в этом окне и
-- пересобираем сопоставления названий раз в неделю, когда точно
-- появился свежий товар (а не произвольно 1 и 15 числа, как раньше).
--
-- cron.schedule с уже существующим именем job обновляет расписание на
-- месте, повторно создавать/удалять job не нужно.

-- Проверка остатка (без Claude, дёшево) — 4 раза в день вместо 2,
-- с уплотнением на вероятное окно обновления по утрам.
select cron.schedule(
  'vanvliet-stock-scan',
  '0 6,8,10,17 * * *',
  $$
  select net.http_post(
    url := 'https://wqburlamuipxmenqsjnx.supabase.co/functions/v1/vanvliet-stock-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'vanvliet_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Подбор названий (через Claude) — раз в неделю по вторникам, с
-- запасом в пару часов после утренней доставки, а не по месяцам.
select cron.schedule(
  'vanvliet-alias-refresh',
  '0 7 * * 2',
  $$
  select net.http_post(
    url := 'https://wqburlamuipxmenqsjnx.supabase.co/functions/v1/vanvliet-alias-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'vanvliet_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
