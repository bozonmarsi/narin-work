UPDATE subscription_frequency_tiers
SET active = false
WHERE deliveries_per_cycle IN (5, 6, 7, 8);
