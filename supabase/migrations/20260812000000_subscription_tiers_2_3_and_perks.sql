-- Adds 2 and 3 deliveries/month as selectable frequencies, and restructures
-- perks: secateurs unlock at 3+ deliveries, partner certificate at 4+ — and
-- both persist at every higher tier (a tier that qualifies for a perk keeps
-- it, doesn't lose it going up). Safe to re-run.

INSERT INTO subscription_frequency_tiers (deliveries_per_cycle, discount_percent, perk_text) VALUES
  (2, 0, NULL),
  (3, 0, 'Sekáčky darem')
ON CONFLICT (deliveries_per_cycle) DO NOTHING;

UPDATE subscription_frequency_tiers SET perk_text = 'Sekáčky darem + partnerský certifikát'
WHERE deliveries_per_cycle IN (4, 5, 6, 7, 8);
