-- Florist-uploaded preview photo for a specific subscription delivery,
-- shown to the client a couple of days before that occurrence's date.

ALTER TABLE subscription_occurrences ADD COLUMN IF NOT EXISTS preview_photo_url text;
ALTER TABLE subscription_occurrences ADD COLUMN IF NOT EXISTS preview_uploaded_at timestamptz;
