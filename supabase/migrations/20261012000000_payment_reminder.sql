-- Napominanie ob oplate. Zakaz so Stripe zapisyvaetsya v bazu v moment
-- "oformit", do oplaty (status "Ozhidaet oplaty"); "Oplacheno" stavit
-- Stripe-vebhuk tolko pri uspeshnom platezhe. Esli klient zakryl okno Stripe
-- ili karta ne proshla, zakaz tak i visit, a klient ne znaet, chto delat.
--
-- Cherez chas posle oformleniya klientu uhodit odno pismo (shablon
-- "payment_reminder" v web/src/app/api/brevo/notify/route.ts, cheshskij
-- tekst, tot zhe dizajn, chto u ostalnykh pisem), a menedzheram - korotkaya
-- pometka v Telegram. Povtorno ne shlem: otpravka otmechaetsya v
-- tilda_orders.payment_reminder_sent_at.
--
-- Ne napominaem, esli: zakaz uzhe oplachen / otmenen / vyshel iz statusa
-- "new"; net email; zakaz starshe sutok (togda klient uzhe tochno ne vernetsya
-- po etomu pismu); u etogo klienta poyavilsya bolee pozdnij zakaz (on
-- oformil zanovo).
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS payment_reminder_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.send_payment_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_count integer := 0;
BEGIN
  FOR o IN
    SELECT t.*
    FROM tilda_orders t
    WHERE t.payment_status::text = '🟠 Ожидает оплаты'
      AND t.payment_method ILIKE '%stripe%'
      AND t.status = 'new'
      AND t.payment_reminder_sent_at IS NULL
      AND t.created_at <= now() - interval '1 hour'
      AND t.created_at >= now() - interval '24 hours'
      AND coalesce(t.customer_email, '') LIKE '%@%'
      AND NOT EXISTS (
        SELECT 1 FROM tilda_orders n
        WHERE lower(n.customer_email) = lower(t.customer_email)
          AND n.created_at > t.created_at
      )
    ORDER BY t.created_at
    LIMIT 50
  LOOP
    -- Snachala otmetka, potom otpravka: sbojnyj retry ne dolzhen privesti
    -- k dvum pismam odnomu klientu.
    UPDATE tilda_orders SET payment_reminder_sent_at = now() WHERE id = o.id;

    PERFORM notify_brevo(jsonb_build_object(
      'event', 'payment_reminder',
      'order_id', coalesce(o.order_id, o.id::text),
      'email', o.customer_email,
      'recipient_name', o.recipient_name,
      'products_text', o.products_text,
      'order_total', o.order_total,
      'delivery_date', to_char(o.delivery_date, 'YYYY-MM-DD'),
      'delivery_time', coalesce(nullif(o.delivery_slot, ''), nullif(o.delivery_time_raw, ''))
    ));

    PERFORM notify_telegram_role(
      'manager',
      '💳 Клиент не оплатил заказ <code>' || coalesce(o.order_id, '?') || '</code> (' ||
      coalesce(o.order_total::int::text, '?') || ' Kč) - ему ушло напоминание об оплате на ' || o.customer_email || '.'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_payment_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_payment_reminders() TO service_role;

SELECT cron.schedule('payment-reminders-tick', '*/10 * * * *', $$SELECT send_payment_reminders()$$);
