-- Audit trail for subscriptions, same shape/purpose as order_status_history —
-- written from the manager admin UI on every save, not by a trigger.

CREATE TABLE IF NOT EXISTS subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz DEFAULT now(),
  note text NOT NULL
);

ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_subscription_history" ON subscription_history;
CREATE POLICY "manager_all_subscription_history" ON subscription_history FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

CREATE INDEX IF NOT EXISTS idx_subscription_history_sub ON subscription_history(subscription_id);

-- Storage bucket for florist-uploaded delivery preview photos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('subscription-previews', 'subscription-previews', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "manager_upload_previews" ON storage.objects;
CREATE POLICY "manager_upload_previews" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'subscription-previews'
  AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "manager_manage_previews" ON storage.objects;
CREATE POLICY "manager_manage_previews" ON storage.objects FOR ALL USING (
  bucket_id = 'subscription-previews'
  AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

DROP POLICY IF EXISTS "public_read_previews" ON storage.objects;
CREATE POLICY "public_read_previews" ON storage.objects FOR SELECT USING (
  bucket_id = 'subscription-previews'
);
