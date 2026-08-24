-- Re-set perk_text using Postgres unicode-escape string literals (U&'...')
-- instead of raw pasted UTF-8, because the earlier migration's perk_text
-- values got mangled by a clipboard encoding issue when pasted into the SQL
-- editor. Also drops the "partnerský certifikát" wording everywhere per
-- request — certificate perk is paused for now, scissors gift stays.
UPDATE subscription_frequency_tiers SET perk_text = NULL WHERE deliveries_per_cycle = 2;
UPDATE subscription_frequency_tiers SET perk_text = U&'Sek\00E1\010Dky darem'
WHERE deliveries_per_cycle IN (3, 4, 5, 6, 7, 8);
