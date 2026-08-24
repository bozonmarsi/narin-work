-- Раньше 150 приветственных баллов начислялись только триггером на
-- ПЕРВЫЙ ЗАКАЗ (on_first_order_welcome_points_trigger, живёт вне этого
-- репозитория). Теперь хотим начислять их сразу при регистрации — но
-- нативного вебхука на событие регистрации в Tilda Members нет, поэтому
-- клиентский скрипт на каждой загрузке страницы (если человек залогинен)
-- будет дёргать эту RPC. Функция сама проверяет, не начисляли ли уже
-- баллы этому email (независимо от того, через старый триггер или через
-- эту функцию), и если нет — начисляет один раз.

-- Сравниваем и индексируем по lower(email) — иначе если email в старых
-- записях (через триггер на первый заказ) сохранён в другом регистре,
-- чем то, что отдаёт Tilda из localStorage, проверка "уже начисляли?"
-- не найдёт старую запись и всем ~101 существующим клиентам начислится
-- вторые 150 баллов повторно.
CREATE UNIQUE INDEX IF NOT EXISTS points_transactions_one_welcome_per_email
  ON points_transactions (lower(user_email))
  WHERE type = 'welcome';

CREATE OR REPLACE FUNCTION public.claim_welcome_points(p_email text)
RETURNS TABLE(awarded boolean, amount integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := btrim(p_email);
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM points_transactions
    WHERE lower(user_email) = lower(v_email) AND type = 'welcome'
  ) THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO points_transactions (user_email, amount, type, description, order_id)
    VALUES (v_email, 150, 'welcome', 'Uvítací body za registraci', '');
    RETURN QUERY SELECT true, 150;
  EXCEPTION WHEN unique_violation THEN
    -- Другой таб/запрос успел вставить запись первым за то же мгновение.
    RETURN QUERY SELECT false, 0;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_welcome_points(text) TO anon, authenticated;
