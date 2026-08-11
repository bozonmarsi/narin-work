-- Schedules the subscriptions-generate-orders Edge Function to run daily,
-- promoting upcoming subscription_occurrences into real tilda_orders rows
-- automatically — no manager action needed. The function must be deployed
-- with --no-verify-jwt (it's called by pg_cron, not a logged-in user), so no
-- Authorization header is needed here.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('subscriptions-generate-orders-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subscriptions-generate-orders-daily');

SELECT cron.schedule(
  'subscriptions-generate-orders-daily',
  '0 6 * * *', -- 06:00 UTC every day
  $$
  SELECT net.http_post(
    url := 'https://wqburlamuipxmenqsjnx.supabase.co/functions/v1/subscriptions-generate-orders',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
