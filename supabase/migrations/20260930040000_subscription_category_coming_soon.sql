-- Kategorie předplatného "Připravujeme": na webu je vidět (fotka, popis, šedá
-- plaketa "Připravujeme"), ale nejde vybrat ani zaplatit. Dřív to šlo jen tak,
-- že se vypnuly všechny její linie; teď je to jeden přepínač v aplikaci
-- (Подписки → Каталог и цены → категория → «Připravujeme»).
-- Kytice se tím rovnou přepíná na "Připravujeme" (požadavek z 2026-09-30).
-- Bezpečné spustit opakovaně.
ALTER TABLE subscription_categories ADD COLUMN IF NOT EXISTS coming_soon boolean NOT NULL DEFAULT false;

UPDATE subscription_categories SET coming_soon = true WHERE key = 'bouquet';
