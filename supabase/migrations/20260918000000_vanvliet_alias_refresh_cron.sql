-- Раз в полмесяца (1 и 15 число) вызывает vanvliet-alias-refresh, которая
-- через Claude обновляет соответствия "наш цветок" -> "название у Van
-- Vliet" под текущий каталог поставщика. pg_cron и pg_net уже включены
-- в проекте.
--
-- Секрет для авторизации функции хранится в Supabase Vault под именем
-- 'vanvliet_cron_secret' (заводится один раз отдельной командой, не
-- здесь — в файл миграции сам секрет не попадает).
select cron.schedule(
  'vanvliet-alias-refresh',
  '0 3 1,15 * *',
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
