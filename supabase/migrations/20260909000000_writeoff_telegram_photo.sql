-- Списание больше не грузит фото в Supabase Storage — фото уходит
-- менеджеру в Telegram сообщением (см. /api/warehouse/write-off-photo),
-- здесь остаётся только file_id для истории, сам файл нигде не хранится.
ALTER TABLE write_offs RENAME COLUMN photo_url TO telegram_file_id;
ALTER TABLE write_offs ALTER COLUMN telegram_file_id DROP NOT NULL;
ALTER TABLE write_offs ADD CONSTRAINT write_offs_quantity_positive CHECK (quantity > 0);

-- Список чатов менеджеров с подключённым Telegram — нужен клиенту, чтобы
-- отправить фото списания напрямую через Bot API (обычный notify_telegram
-- умеет только текст, а фото шлётся из браузера отдельным запросом).
CREATE OR REPLACE FUNCTION get_manager_telegram_chat_ids()
RETURNS TABLE (chat_id bigint) AS $$
  SELECT telegram_chat_id FROM users
  WHERE role = 'manager' AND telegram_chat_id IS NOT NULL AND (is_manager() OR is_warehouse());
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_manager_telegram_chat_ids() TO authenticated;

-- Текстовое уведомление о списании — только если фото не отправлялось
-- отдельным сообщением (иначе менеджер и так всё увидит в подписи к фото,
-- дублировать незачем).
CREATE OR REPLACE FUNCTION tg_notify_write_off()
RETURNS trigger AS $$
DECLARE
  v_product text;
  v_reason text;
BEGIN
  IF NEW.telegram_file_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT ps.product_name INTO v_product
  FROM batches b JOIN product_stickers ps ON ps.id = b.product_sticker_id
  WHERE b.id = NEW.batch_id;

  v_reason := CASE NEW.reason
    WHEN 'wilted' THEN 'увял'
    WHEN 'damaged' THEN 'сломан'
    WHEN 'defect' THEN 'брак'
    WHEN 'miscount' THEN 'пересчёт'
    ELSE NEW.reason
  END;

  PERFORM notify_telegram_role(
    'manager',
    '📉 Списание: ' || decode_html_entities(COALESCE(v_product, '—')) || ', ' || NEW.quantity || ' шт, ' || v_reason ||
    CASE WHEN NEW.notes IS NOT NULL AND NEW.notes <> '' THEN ' — ' || NEW.notes ELSE '' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_notify_write_off ON write_offs;
CREATE TRIGGER trigger_notify_write_off
AFTER INSERT ON write_offs
FOR EACH ROW
EXECUTE FUNCTION tg_notify_write_off();
