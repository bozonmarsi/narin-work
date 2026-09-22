-- Массовый импорт лидов в newsletter_subscribers (например, экспорт формы
-- "Chci vědět první" с заглушки — те submissions живут только в самой
-- Tilda, не у нас, менеджер их выгружает и вставляет через дашборд).
-- Отдельная RPC, а не INSERT ... ON CONFLICT (lower(email)) через
-- supabase-js upsert() напрямую, потому что уникальный индекс у нас
-- функциональный (lower(email)), а upsert() умеет целиться только в
-- обычный constraint по имени колонки.
CREATE OR REPLACE FUNCTION public.import_newsletter_emails(p_emails text[], p_source text DEFAULT 'signup_form')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT is_manager() THEN
    RETURN 0;
  END IF;

  WITH ins AS (
    INSERT INTO newsletter_subscribers (email, source)
    SELECT DISTINCT lower(btrim(e)), COALESCE(NULLIF(btrim(p_source), ''), 'signup_form')
    FROM unnest(p_emails) AS e
    WHERE btrim(e) <> ''
    ON CONFLICT (lower(email)) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_newsletter_emails(text[], text) TO authenticated;
