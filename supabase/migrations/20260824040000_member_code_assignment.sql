-- Номер на карточке клиента (ma_id) раньше приходил откуда-то извне (не
-- из этого репозитория) и ставился ненадёжно — у 10 из 84 клиентов его
-- вообще нет. Берём это под свой контроль: 8-значный случайный номер
-- (не по порядку — угадать соседний номер не должно быть тривиально),
-- присваивается автоматически при создании строки в "Tilda points",
-- то есть сработает для любого способа появления клиента (первый заказ,
-- регистрация и т.д.), без завязки на конкретный код.
--
-- Существующие настоящие номера не трогаем — только заполняем пустые.
CREATE OR REPLACE FUNCTION public.assign_member_code()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  candidate text;
BEGIN
  IF NEW.ma_id IS NOT NULL AND NEW.ma_id <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    candidate := lpad((floor(random() * 90000000) + 10000000)::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "Tilda points" WHERE ma_id = candidate);
  END LOOP;

  NEW.ma_id := candidate;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_assign_member_code ON "Tilda points";
CREATE TRIGGER trigger_assign_member_code
  BEFORE INSERT ON "Tilda points"
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_member_code();

-- Бэкафилл для уже существующих клиентов без номера.
DO $$
DECLARE
  r RECORD;
  candidate text;
BEGIN
  FOR r IN SELECT email FROM "Tilda points" WHERE ma_id IS NULL OR ma_id = '' LOOP
    LOOP
      candidate := lpad((floor(random() * 90000000) + 10000000)::text, 8, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Tilda points" WHERE ma_id = candidate);
    END LOOP;
    UPDATE "Tilda points" SET ma_id = candidate WHERE email = r.email;
  END LOOP;
END $$;
