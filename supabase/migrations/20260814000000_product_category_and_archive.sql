-- Lets managers tag products (buket/set/ohapka/atelier/otkrytka) and archive
-- old/discontinued names so they stop cluttering the active list without
-- deleting the row (order history and stickers already earned still point
-- to it by name).
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
