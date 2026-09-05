-- Наличие охапки "на сегодня" раньше было отдельной ручной кнопкой,
-- никак не связанной с реальным остатком — флорист мог принять партию
-- и забыть отдельно нажать "в наличии", и сайт продолжал бы показывать
-- "нет сегодня". Теперь для товаров с категорией "ohapka" наличие
-- считается напрямую от product_stickers.quantity (тот же остаток,
-- что двигает склад): есть остаток — в наличии, кончился — снято.
-- Для готовых букетов/сетов (без своего учёта стеблей) кнопка остаётся
-- ручной, как была.
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

-- Разово синхронизируем то, что уже есть в базе прямо сейчас.
INSERT INTO product_availability (product_name, updated_at)
SELECT product_name, now() FROM product_stickers
WHERE category = 'ohapka' AND COALESCE(quantity, 0) > 0
ON CONFLICT (product_name) DO NOTHING;

DELETE FROM product_availability pa
USING product_stickers ps
WHERE ps.product_name = pa.product_name
  AND ps.category = 'ohapka'
  AND COALESCE(ps.quantity, 0) <= 0;
