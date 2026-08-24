-- Optional add-on, selectable from 4 deliveries/month and up: each delivery
-- comes in a vase sized for that bouquet's stems, and one vase stays with
-- the client for free. Purely a client preference, no price effect.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS vase_exchange boolean NOT NULL DEFAULT false;
