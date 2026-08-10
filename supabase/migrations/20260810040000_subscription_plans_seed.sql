-- subscription_plans was created empty in 20260810000000 — the price rows
-- were never actually inserted, so every plan lookup failed. Placeholder
-- prices, same as agreed for testing; replace from the manager cabinet later.

INSERT INTO subscription_plans (line_id, size, price_per_delivery)
SELECT id, 'small'::subscription_size, 590 FROM subscription_lines WHERE name = 'Pouze růže'
UNION ALL SELECT id, 'medium'::subscription_size, 790 FROM subscription_lines WHERE name = 'Pouze růže'
UNION ALL SELECT id, 'large'::subscription_size, 990 FROM subscription_lines WHERE name = 'Pouze růže'
UNION ALL SELECT id, 'small'::subscription_size, 790 FROM subscription_lines WHERE name = 'Exotika'
UNION ALL SELECT id, 'medium'::subscription_size, 990 FROM subscription_lines WHERE name = 'Exotika'
UNION ALL SELECT id, 'large'::subscription_size, 1290 FROM subscription_lines WHERE name = 'Exotika'
UNION ALL SELECT id, 'small'::subscription_size, 690 FROM subscription_lines WHERE name = 'Na uvážení floristy'
UNION ALL SELECT id, 'medium'::subscription_size, 890 FROM subscription_lines WHERE name = 'Na uvážení floristy'
UNION ALL SELECT id, 'large'::subscription_size, 1190 FROM subscription_lines WHERE name = 'Na uvážení floristy'
ON CONFLICT (line_id, size) DO NOTHING;
