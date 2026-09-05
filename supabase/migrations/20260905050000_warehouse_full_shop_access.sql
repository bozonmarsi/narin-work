-- Флорист получает полный доступ к "Магазину" — заводить новые товары
-- (цветы, которых ещё нет на складе), ставить "В наличии сегодня",
-- работать с бейджами/категориями и т.д. То же самое, что видит
-- менеджер на этой странице.

DROP POLICY IF EXISTS "manager_write_product_stickers" ON product_stickers;
CREATE POLICY "manager_write_product_stickers" ON product_stickers FOR ALL USING (
  is_manager() OR is_warehouse()
) WITH CHECK (
  is_manager() OR is_warehouse()
);

DROP POLICY IF EXISTS "manager_upload_product_stickers" ON storage.objects;
CREATE POLICY "manager_upload_product_stickers" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'product-stickers'
  AND (is_manager() OR is_warehouse())
);

DROP POLICY IF EXISTS "manager_manage_product_stickers" ON storage.objects;
CREATE POLICY "manager_manage_product_stickers" ON storage.objects FOR ALL USING (
  bucket_id = 'product-stickers'
  AND (is_manager() OR is_warehouse())
);

DROP POLICY IF EXISTS "manager_write_product_availability" ON product_availability;
CREATE POLICY "manager_write_product_availability" ON product_availability
  FOR ALL USING (is_manager() OR is_warehouse())
  WITH CHECK (is_manager() OR is_warehouse());

DROP POLICY IF EXISTS "manager_all_weekly_closed" ON shop_weekly_closed_days;
CREATE POLICY "manager_all_weekly_closed" ON shop_weekly_closed_days FOR ALL USING (
  is_manager() OR is_warehouse()
);

DROP POLICY IF EXISTS "manager_all_closed_dates" ON shop_closed_dates;
CREATE POLICY "manager_all_closed_dates" ON shop_closed_dates FOR ALL USING (
  is_manager() OR is_warehouse()
);
