-- product_stickers only had a read policy — the manager UI now needs to
-- create new products and swap sticker images, so add write access and a
-- storage bucket for the uploaded images (same pattern as
-- subscription-previews).
DROP POLICY IF EXISTS "manager_write_product_stickers" ON product_stickers;
CREATE POLICY "manager_write_product_stickers" ON product_stickers FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
) WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-stickers', 'product-stickers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "manager_upload_product_stickers" ON storage.objects;
CREATE POLICY "manager_upload_product_stickers" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'product-stickers'
  AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "manager_manage_product_stickers" ON storage.objects;
CREATE POLICY "manager_manage_product_stickers" ON storage.objects FOR ALL USING (
  bucket_id = 'product-stickers'
  AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "public_read_product_stickers_storage" ON storage.objects;
CREATE POLICY "public_read_product_stickers_storage" ON storage.objects FOR SELECT USING (
  bucket_id = 'product-stickers'
);
