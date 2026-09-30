-- Předplatné: ovládání z manažerské aplikace + automatické prodloužení.
--
-- 1) Fotky kategorií a linií — manažer je nahrává v Каталог подписок,
--    dřív tam šlo jen vyplnit text a na webu byly dočasné fotky ze Unsplash.
-- 2) subscription_settings — jedna řádka s volbami konstruktoru, které dřív
--    byly natvrdo v kódu stránky: nálady, výměna váz (zapnuto/vypnuto, od kolika
--    dodávek), zda se ptát na náladu a na "co nechcete vidět".
-- 3) subscriptions.last_renewed_invoice_id — Stripe strhává platbu každé 4 týdny,
--    ale nový cyklus dodávek se dřív vytvářel jen ručně tlačítkem
--    "Сгенерировать следующий цикл". Webhook teď na invoice.paid vytvoří další
--    cyklus sám; tady si pamatuje poslední zpracovanou fakturu, aby opakované
--    doručení stejné události z Stripe nevytvořilo cyklus dvakrát.
-- Bezpečné spustit opakovaně.

-- ---------- 1) úložiště fotek ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('subscription-images', 'subscription-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "manager_manage_subscription_images" ON storage.objects;
CREATE POLICY "manager_manage_subscription_images" ON storage.objects FOR ALL USING (
  bucket_id = 'subscription-images' AND is_manager()
) WITH CHECK (
  bucket_id = 'subscription-images' AND is_manager()
);

DROP POLICY IF EXISTS "public_read_subscription_images" ON storage.objects;
CREATE POLICY "public_read_subscription_images" ON storage.objects FOR SELECT USING (
  bucket_id = 'subscription-images'
);

-- ---------- 2) nastavení konstruktoru ----------
CREATE TABLE IF NOT EXISTS subscription_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  moods text[] NOT NULL DEFAULT ARRAY['Romantická','Jasná','Pastelová','Divoká','Klasická','Minimalistická','Luxusní'],
  mood_enabled boolean NOT NULL DEFAULT true,
  exclusions_enabled boolean NOT NULL DEFAULT true,
  vase_enabled boolean NOT NULL DEFAULT true,
  vase_min_deliveries int NOT NULL DEFAULT 4,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO subscription_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE subscription_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_subscription_settings" ON subscription_settings;
CREATE POLICY "public_read_subscription_settings" ON subscription_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "manager_write_subscription_settings" ON subscription_settings;
CREATE POLICY "manager_write_subscription_settings" ON subscription_settings FOR ALL USING (is_manager()) WITH CHECK (is_manager());

-- ---------- 3) automatické prodloužení ----------
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_renewed_invoice_id text;
