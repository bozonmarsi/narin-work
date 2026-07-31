-- Привязка Telegram: у каждого сотрудника свой одноразовый код для
-- подключения бота (отправляет боту /start <код>) и chat_id, куда слать
-- уведомления после подключения.
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code text UNIQUE;

-- Разово генерируем код для всех, у кого его ещё нет.
UPDATE users
SET telegram_link_code = substr(md5(random()::text || id::text), 1, 8)
WHERE telegram_link_code IS NULL;

-- Автоматически генерировать код для новых сотрудников тоже.
CREATE OR REPLACE FUNCTION generate_telegram_link_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.telegram_link_code IS NULL THEN
    NEW.telegram_link_code := substr(md5(random()::text || NEW.id::text), 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_telegram_link_code ON users;
CREATE TRIGGER trigger_generate_telegram_link_code
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION generate_telegram_link_code();
