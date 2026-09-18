-- Исправление к 20260918010000/020000: та версия ошибочно завязывала
-- бейдж "Doručíme dnes/zítra" на остаток у Van Vliet — но "Zítra" и так
-- уже показывается по умолчанию всем товарам-охапкам, которых нет в
-- product_availability (см. tilda/blocks/catalog-availability-badges.html),
-- завязка ничего не меняла на практике. Возвращаем триггер к исходному
-- простому виду (только наш остаток).
--
-- Реальная польза от проверки Van Vliet — другая: если товара нет ни у
-- нас, ни у поставщика одновременно, "Zítra" превращается в пустое
-- обещание, которое мы не сможем выполнить. Именно этот (узкий) случай
-- теперь прячет товар с сайта совсем — через новую RPC
-- get_unsourceable_products(), тем же способом, что уже используют
-- get_available_products()/get_special_order_products().
--
-- Никакого Telegram-уведомления — решили не грузить чат, менеджер видит
-- нужное в бейдже панели и на самом сайте (товар просто исчезает).

alter table product_stickers
  add column if not exists vanvliet_in_stock boolean,
  add column if not exists vanvliet_stock_checked_at timestamptz;

CREATE OR REPLACE FUNCTION tg_sync_ohapka_availability()
RETURNS trigger AS $$
BEGIN
  IF NEW.category = 'ohapka' AND (OLD.quantity IS DISTINCT FROM NEW.quantity) THEN
    IF COALESCE(NEW.quantity, 0) > 0 THEN
      INSERT INTO product_availability (product_name, updated_at)
      VALUES (NEW.product_name, now())
      ON CONFLICT (product_name) DO UPDATE SET updated_at = now();
    ELSE
      DELETE FROM product_availability WHERE product_name = NEW.product_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_sync_ohapka_availability ON product_stickers;
CREATE TRIGGER trigger_sync_ohapka_availability
AFTER UPDATE ON product_stickers
FOR EACH ROW
EXECUTE FUNCTION tg_sync_ohapka_availability();

-- Строго false (не null) — если алиаса с Van Vliet ещё нет, сканер
-- никогда не трогал этот столбец, он остаётся NULL, и товар НЕ прячется
-- (по умолчанию, как раньше) — прячем только то, что реально проверили
-- и подтвердили как недоступное с обеих сторон.
CREATE OR REPLACE FUNCTION public.get_unsourceable_products()
RETURNS TABLE(product_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT product_name FROM product_stickers
  WHERE category = 'ohapka'
    AND archived = false
    AND COALESCE(quantity, 0) <= 0
    AND vanvliet_in_stock = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_unsourceable_products() TO anon, authenticated;

-- Ежедневный сканер Van Vliet (только чтение каталога поставщика,
-- никогда не заказывает) — дважды в день проставляет vanvliet_in_stock,
-- на нём и держится вся эта RPC.
select cron.schedule(
  'vanvliet-stock-scan',
  '0 7,17 * * *',
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
