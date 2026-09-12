-- Журнал того, что реально куплено у Van Vliet через vanvliet-order —
-- до сих пор эта функция только дёргала API поставщика и ничего не
-- запоминала у нас, поэтому не было видно, чего и когда ждать. Пишется
-- самой функцией на сервере (после реального успеха у поставщика), а
-- не с фронта — так запись не потеряется и не разъедется с тем, что
-- реально произошло.
CREATE TABLE IF NOT EXISTS vanvliet_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_sticker_id uuid REFERENCES product_stickers(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  color text,
  quantity numeric NOT NULL,
  price_per_unit numeric,
  total_price numeric,
  target_date date,
  cart_product_key bigint,
  ordered_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vanvliet_purchases_date_idx ON vanvliet_purchases (target_date);

ALTER TABLE vanvliet_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_vanvliet_purchases" ON vanvliet_purchases;
CREATE POLICY "manager_all_vanvliet_purchases" ON vanvliet_purchases
  FOR ALL USING (is_manager()) WITH CHECK (is_manager());

ALTER PUBLICATION supabase_realtime ADD TABLE vanvliet_purchases;
