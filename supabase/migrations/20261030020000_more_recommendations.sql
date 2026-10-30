-- More flowers in "Složte si vlastní kytici" (2026-10-30): up to 5–6 per role instead of 2–3.
-- The card shows them in one slider, roles take turns, and only flowers that are in the catalog now.
-- The trigger on rec_settings recomputes product_recs right away.
update public.rec_settings set
  recipe = '{"focal":{"greenery":5,"filler":6,"focal":5,"accent":5},
             "filler":{"focal":6,"greenery":5,"accent":5,"filler":3},
             "greenery":{"focal":6,"filler":6,"accent":5,"greenery":2},
             "accent":{"focal":6,"greenery":5,"filler":5,"accent":2}}',
  updated_at = now()
where id = 1;
