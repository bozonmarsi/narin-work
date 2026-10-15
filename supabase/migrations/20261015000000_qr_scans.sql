-- Короткие ссылки для QR-кодов на печатных карточках (narin-work.vercel.app/q/<slug>).
-- Куда ведёт каждая ссылка, решает код (web/src/app/q/[slug]/route.ts), поэтому
-- адрес можно поменять без перепечатки. Здесь только счётчик: каждый скан —
-- одна строка, видна менеджерам.
CREATE TABLE IF NOT EXISTS qr_scans (
  id bigserial PRIMARY KEY,
  slug text NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);

CREATE INDEX IF NOT EXISTS qr_scans_slug_time ON qr_scans (slug, scanned_at DESC);

ALTER TABLE qr_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_read_qr_scans" ON qr_scans;
CREATE POLICY "manager_read_qr_scans" ON qr_scans FOR SELECT USING (is_manager());

-- Запись только через эту функцию: slug — короткое латинское слово, user agent обрезан.
CREATE OR REPLACE FUNCTION log_qr_scan(p_slug text, p_user_agent text DEFAULT NULL)
RETURNS void AS $$
BEGIN
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9-]{1,32}$' THEN
    RETURN;
  END IF;
  INSERT INTO qr_scans (slug, user_agent) VALUES (p_slug, left(p_user_agent, 300));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION log_qr_scan(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_qr_scan(text, text) TO anon, authenticated;
