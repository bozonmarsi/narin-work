-- Telegram — необязательное поле при регистрации фирмы (в отличие от
-- IČO/имени/телефона, которые обязательны). Даёт ещё один канал связи с
-- контактным лицом компании, если человеку так удобнее, чем по email.
ALTER TABLE company_registration_requests ADD COLUMN IF NOT EXISTS telegram text;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS telegram text;
