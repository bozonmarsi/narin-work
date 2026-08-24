-- Общий механизм "показать эту UI-подсказку/тур ровно один раз в жизни
-- клиента", независимо от устройства/браузера — в отличие от localStorage,
-- который сбрасывается при очистке кэша или входе с другого устройства.
-- Первое применение: обучающий тур по новому личному кабинету (карта,
-- профиль, важные даты, стикеры и т.д.) — должен показаться один раз ВСЕМ
-- клиентам (и новым, и уже зарегистрированным ранее), а не только тем, кто
-- регистрируется прямо сейчас, поэтому не может быть завязан на
-- claim_welcome_points.
--
-- tour_key версионируется (например 'lk_cabinet_v1'), чтобы при будущем
-- крупном редизайне можно было завести 'lk_cabinet_v2' и показать тур
-- заново всем, не трогая старые записи.
CREATE TABLE IF NOT EXISTS ui_tours_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  tour_key text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ui_tours_seen_one_per_email_tour
  ON ui_tours_seen (lower(user_email), tour_key);

CREATE OR REPLACE FUNCTION public.claim_tour_seen(p_email text, p_tour_key text)
RETURNS TABLE(first_time boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := btrim(p_email);
  v_key text := btrim(p_tour_key);
BEGIN
  IF v_email IS NULL OR v_email = '' OR v_key IS NULL OR v_key = '' THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO ui_tours_seen (user_email, tour_key) VALUES (v_email, v_key);
    RETURN QUERY SELECT true;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT false;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_tour_seen(text, text) TO anon, authenticated;
