-- Хранилище для фото при приёмке партий (batches.photo_url) и при
-- списании (write_offs.photo_url) — та же схема бакета, что и у
-- product-stickers, только доступ у склада/менеджера, а не только менеджера.
INSERT INTO storage.buckets (id, name, public)
VALUES ('warehouse-photos', 'warehouse-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "warehouse_staff_upload_warehouse_photos" ON storage.objects;
CREATE POLICY "warehouse_staff_upload_warehouse_photos" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'warehouse-photos'
  AND (is_manager() OR is_warehouse())
);

DROP POLICY IF EXISTS "warehouse_staff_manage_warehouse_photos" ON storage.objects;
CREATE POLICY "warehouse_staff_manage_warehouse_photos" ON storage.objects FOR ALL USING (
  bucket_id = 'warehouse-photos'
  AND (is_manager() OR is_warehouse())
);

DROP POLICY IF EXISTS "public_read_warehouse_photos" ON storage.objects;
CREATE POLICY "public_read_warehouse_photos" ON storage.objects FOR SELECT USING (
  bucket_id = 'warehouse-photos'
);
