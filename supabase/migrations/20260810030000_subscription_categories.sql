-- Top-level product type above "lines" — Kytice / Náruče / Kolekce.

CREATE TABLE IF NOT EXISTS subscription_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  hero_image_url text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscription_lines ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES subscription_categories(id);

ALTER TABLE subscription_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_categories" ON subscription_categories;
CREATE POLICY "manager_all_categories" ON subscription_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "public_read_categories" ON subscription_categories;
CREATE POLICY "public_read_categories" ON subscription_categories FOR SELECT USING (active = true);

INSERT INTO subscription_categories (key, name, description, sort_order) VALUES
  ('bouquet', 'Kytice', 'Aranžováno floristou, hotové k předání', 1),
  ('armful', 'Náruče', 'Přírodní styl, jednoduché balení, více květin', 2),
  ('collection', 'Kolekce', 'Box na sestavení vlastní kytice', 3)
ON CONFLICT (key) DO NOTHING;

UPDATE subscription_lines SET category_id = (SELECT id FROM subscription_categories WHERE key = 'bouquet')
WHERE category_id IS NULL;
