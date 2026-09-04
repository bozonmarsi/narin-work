-- Клиент теперь может сам управлять днём рождения и важными датами со
-- страницы /members/profile. И "Tilda points", и personal_dates имеют
-- RLS только под менеджера (is_manager()) — anon-ключ сайта туда напрямую
-- писать/читать не может. Поэтому, как и с claim_welcome_points/
-- claim_tour_seen, даём три узкие SECURITY DEFINER функции: подтверждают
-- email, ничего больше не трогают.
--
-- Компромисс по безопасности тот же, что уже принят для остальных
-- customer-facing RPC этой сессии: доступ проверяется только по email
-- (без пароля/токена) — кто-то, кто узнает чужой email, теоретически
-- сможет поменять чужой день рождения или добавить/удалить дату. Это не
-- задевает деньги/баллы, риск невысокий, но стоит иметь в виду.

CREATE OR REPLACE FUNCTION public.set_customer_birthday(p_email text, p_birthday date)
RETURNS TABLE(ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := btrim(p_email);
BEGIN
  IF v_email IS NULL OR v_email = '' OR p_birthday IS NULL THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  UPDATE "Tilda points" SET birthday = p_birthday WHERE lower(email) = lower(v_email);

  IF NOT FOUND THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  INSERT INTO customer_activity_log (customer_email, action, details)
  VALUES (v_email, 'birthday_set', 'самообслуживание, /members/profile');

  RETURN QUERY SELECT true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_customer_birthday(text, date) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_customer_birthday(p_email text)
RETURNS TABLE(birthday date)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.birthday
  FROM "Tilda points" tp
  WHERE lower(tp.email) = lower(btrim(p_email));
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_birthday(text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.list_customer_dates(p_email text)
RETURNS TABLE(id uuid, label text, event_date date, recurrence text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pd.id, pd.label, pd.event_date, pd.recurrence
  FROM personal_dates pd
  WHERE lower(pd.email) = lower(btrim(p_email))
  ORDER BY pd.event_date;
$$;

GRANT EXECUTE ON FUNCTION public.list_customer_dates(text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.add_customer_date(p_email text, p_label text, p_event_date date, p_recurrence text)
RETURNS TABLE(ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := btrim(p_email);
  v_label text := btrim(p_label);
BEGIN
  IF v_email IS NULL OR v_email = '' OR v_label IS NULL OR v_label = '' OR p_event_date IS NULL THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  INSERT INTO personal_dates (email, label, event_date, recurrence)
  VALUES (v_email, v_label, p_event_date, COALESCE(p_recurrence, 'yearly'));

  INSERT INTO customer_activity_log (customer_email, action, details)
  VALUES (v_email, 'date_added', v_label || ' — ' || p_event_date::text || ' (самообслуживание)');

  RETURN QUERY SELECT true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_customer_date(text, text, date, text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.delete_customer_date(p_email text, p_id uuid)
RETURNS TABLE(ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := btrim(p_email);
  v_label text;
BEGIN
  IF v_email IS NULL OR v_email = '' OR p_id IS NULL THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  -- Удаляем, только если дата реально принадлежит этому email — иначе
  -- зная чужой UUID можно было бы удалить любую чужую дату.
  DELETE FROM personal_dates
  WHERE id = p_id AND lower(email) = lower(v_email)
  RETURNING label INTO v_label;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  INSERT INTO customer_activity_log (customer_email, action, details)
  VALUES (v_email, 'date_deleted', v_label || ' (самообслуживание)');

  RETURN QUERY SELECT true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_customer_date(text, uuid) TO anon, authenticated;
