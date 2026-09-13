-- Реальная логика склада: заказала сегодня — завтра с утра едешь на
-- оптовую базу и по списку забираешь то, что заказано. Нужен признак
-- "забрано" по каждой покупке, чтобы список забора не путался со всем
-- журналом закупок.
ALTER TABLE vanvliet_purchases ADD COLUMN IF NOT EXISTS picked_up boolean NOT NULL DEFAULT false;
ALTER TABLE vanvliet_purchases ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
