-- The subscription catalog (lines, plans, frequency tiers, shop calendar) is
-- public pricing information — the Tilda ЛК reads it directly with the anon
-- key to power the live constructor. Writes stay manager-only (existing
-- policies from 20260810000000_subscriptions_schema.sql).

DROP POLICY IF EXISTS "public_read_lines" ON subscription_lines;
CREATE POLICY "public_read_lines" ON subscription_lines FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "public_read_plans" ON subscription_plans;
CREATE POLICY "public_read_plans" ON subscription_plans FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "public_read_tiers" ON subscription_frequency_tiers;
CREATE POLICY "public_read_tiers" ON subscription_frequency_tiers FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "public_read_weekly_closed" ON shop_weekly_closed_days;
CREATE POLICY "public_read_weekly_closed" ON shop_weekly_closed_days FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_closed_dates" ON shop_closed_dates;
CREATE POLICY "public_read_closed_dates" ON shop_closed_dates FOR SELECT USING (true);
