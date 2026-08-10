-- Narin flower shop — "Předplatné" (flower subscriptions)
-- Same Supabase project as the rest of this app (wqburlamuipxmenqsjnx) — the
-- Tilda members ЛК talks to these tables via Edge Functions using the email
-- from tilda_members_profile as the identity key (no Supabase Auth session
-- for Tilda customers), the manager app talks to them directly as this repo
-- already does for tilda_orders.

-- =========================================================
-- 1. ENUM TYPES
-- =========================================================

DO $$ BEGIN
  CREATE TYPE subscription_size AS ENUM ('small', 'medium', 'large');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE occurrence_status AS ENUM ('planned', 'generated', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- 2. CATALOG — manager-editable, no relation to any one client
-- =========================================================

CREATE TABLE IF NOT EXISTS subscription_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES subscription_lines(id) ON DELETE CASCADE,
  size subscription_size NOT NULL,
  price_per_delivery numeric NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (line_id, size)
);

CREATE TABLE IF NOT EXISTS subscription_frequency_tiers (
  deliveries_per_cycle int PRIMARY KEY,
  discount_percent numeric NOT NULL DEFAULT 0,
  perk_text text,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO subscription_frequency_tiers (deliveries_per_cycle, discount_percent, perk_text) VALUES
  (4, 0, NULL),
  (5, 3, NULL),
  (6, 6, 'Sekáčky na květiny darem'),
  (7, 9, 'Sekáčky na květiny darem'),
  (8, 12, 'Sekáčky darem + partnerský certifikát')
ON CONFLICT (deliveries_per_cycle) DO NOTHING;

-- Placeholder prices — replace from the manager cabinet once real pricing is set.
INSERT INTO subscription_lines (name, description, sort_order) VALUES
  ('Pouze růže', 'Různé odrůdy růží při každé dodávce', 1),
  ('Exotika', 'Sezónní exotické květiny dle dostupnosti', 2),
  ('Na uvážení floristy', 'Sezónní výběr podle nálady, který sestaví náš florista', 3)
ON CONFLICT DO NOTHING;

-- =========================================================
-- 3. SHOP CALENDAR — manager-editable, drives date generation
-- =========================================================

-- weekday: 0 = Sunday .. 6 = Saturday (matches JS Date#getUTCDay())
CREATE TABLE IF NOT EXISTS shop_weekly_closed_days (
  weekday int PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6)
);

INSERT INTO shop_weekly_closed_days (weekday) VALUES (0) -- Sunday
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS shop_closed_dates (
  closed_date date PRIMARY KEY,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- =========================================================
-- 4. SUBSCRIPTIONS — one row per client subscription
-- =========================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,

  -- catalog reference (kept for display/analytics; NOT the source of truth for price)
  line_id uuid REFERENCES subscription_lines(id),
  line_name_snapshot text NOT NULL,
  size subscription_size NOT NULL,

  -- frozen at time of purchase — a later price/discount change must never
  -- retroactively change what an already-paying customer owes
  price_per_delivery_snapshot numeric NOT NULL,
  deliveries_per_cycle int NOT NULL,
  discount_percent_snapshot numeric NOT NULL DEFAULT 0,
  cycle_price_snapshot numeric NOT NULL,

  mood_note text,
  exclusions_note text,

  -- default recipient — same column names as tilda_orders so a generated
  -- occurrence can be copied across without any field mapping
  recipient_name text NOT NULL,
  recipient_phone text NOT NULL,
  address text NOT NULL,
  city text,
  psk text,
  patro text,
  company_name text,
  cislo_bytu text,
  kod_intercomu text,
  recipient_lat float8,
  recipient_lng float8,
  senders_name_postcard text,
  recipients_name_postcard text,
  postcard_comment text,

  cycle_anchor_date date NOT NULL, -- client-chosen start date; each new cycle's dates are built from this
  status subscription_status NOT NULL DEFAULT 'active',

  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,

  created_at timestamptz DEFAULT now(),
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON subscriptions (email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);

-- =========================================================
-- 5. SUBSCRIPTION OCCURRENCES — one row per planned/generated delivery
-- =========================================================

CREATE TABLE IF NOT EXISTS subscription_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  status occurrence_status NOT NULL DEFAULT 'planned',

  -- per-date override — NULL means "use the subscription's default recipient"
  recipient_name text,
  recipient_phone text,
  address text,
  city text,
  psk text,
  patro text,
  company_name text,
  cislo_bytu text,
  kod_intercomu text,
  recipient_lat float8,
  recipient_lng float8,
  senders_name_postcard text,
  recipients_name_postcard text,
  postcard_comment text,

  order_id uuid REFERENCES tilda_orders(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (subscription_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS idx_occurrences_subscription ON subscription_occurrences (subscription_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_date ON subscription_occurrences (occurrence_date);

-- =========================================================
-- 6. tilda_orders — tag orders generated from a subscription
-- =========================================================

ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES subscriptions(id);

-- =========================================================
-- 7. RLS — manager sees/manages everything, same pattern as tilda_orders;
-- catalog + shop calendar tables are edited by the manager app and read by
-- the Tilda ЛК Edge Functions (service role bypasses RLS there, matching
-- the existing personal-dates / customer-deposit functions).
-- =========================================================

ALTER TABLE subscription_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_frequency_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_weekly_closed_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_closed_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_lines" ON subscription_lines;
CREATE POLICY "manager_all_lines" ON subscription_lines FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "manager_all_plans" ON subscription_plans;
CREATE POLICY "manager_all_plans" ON subscription_plans FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "manager_all_tiers" ON subscription_frequency_tiers;
CREATE POLICY "manager_all_tiers" ON subscription_frequency_tiers FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "manager_all_weekly_closed" ON shop_weekly_closed_days;
CREATE POLICY "manager_all_weekly_closed" ON shop_weekly_closed_days FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "manager_all_closed_dates" ON shop_closed_dates;
CREATE POLICY "manager_all_closed_dates" ON shop_closed_dates FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "manager_all_subscriptions" ON subscriptions;
CREATE POLICY "manager_all_subscriptions" ON subscriptions FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "manager_all_occurrences" ON subscription_occurrences;
CREATE POLICY "manager_all_occurrences" ON subscription_occurrences FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);
