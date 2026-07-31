-- Извлекает recipient_lat/recipient_lng из raw_payload (их туда кладёт
-- автокомплит адреса на сайте Tilda) в отдельные столбцы tilda_orders,
-- не завися от того, как именно вебхук Tilda создаёт/обновляет заказ.
CREATE OR REPLACE FUNCTION sync_recipient_coordinates()
RETURNS trigger AS $$
DECLARE
  lat_text text;
  lng_text text;
BEGIN
  IF NEW.recipient_lat IS NULL THEN
    lat_text := NEW.raw_payload->>'recipient_lat';
    IF lat_text IS NOT NULL AND lat_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      NEW.recipient_lat := lat_text::float8;
    END IF;
  END IF;

  IF NEW.recipient_lng IS NULL THEN
    lng_text := NEW.raw_payload->>'recipient_lng';
    IF lng_text IS NOT NULL AND lng_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      NEW.recipient_lng := lng_text::float8;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_recipient_coordinates ON tilda_orders;
CREATE TRIGGER trigger_sync_recipient_coordinates
BEFORE INSERT OR UPDATE OF raw_payload ON tilda_orders
FOR EACH ROW
EXECUTE FUNCTION sync_recipient_coordinates();

-- Разово подтягиваем координаты для уже существующих заказов, где они
-- пришли в raw_payload, но остались NULL в столбцах (например, ваш тестовый
-- заказ, оформленный до появления этого триггера).
UPDATE tilda_orders
SET
  recipient_lat = CASE
    WHEN recipient_lat IS NULL
      AND raw_payload->>'recipient_lat' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (raw_payload->>'recipient_lat')::float8
    ELSE recipient_lat
  END,
  recipient_lng = CASE
    WHEN recipient_lng IS NULL
      AND raw_payload->>'recipient_lng' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (raw_payload->>'recipient_lng')::float8
    ELSE recipient_lng
  END
WHERE raw_payload ? 'recipient_lat' OR raw_payload ? 'recipient_lng';
