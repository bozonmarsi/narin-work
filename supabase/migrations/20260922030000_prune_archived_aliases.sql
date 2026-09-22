-- Соответствия для уже архивных товаров (старые названия/дубли) —
-- мёртвый вес: сами товары больше не продаются и не ищутся, никакой
-- пользы от их алиасов не остаётся. alias-refresh/stock-scan теперь
-- и не трогают архивные позиции вовсе (см. код функций), но то, что
-- уже накопилось раньше, само не уйдёт — чистим разово.
DELETE FROM product_name_aliases
WHERE product_sticker_id IN (SELECT id FROM product_stickers WHERE archived = true);
