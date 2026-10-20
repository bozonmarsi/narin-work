-- Cas vyzvednuti (u samovyzvednuti je v delivery_time_raw, delivery_slot je prazdny retezec)
-- se do e-mailu nedostaval: COALESCE(delivery_slot, delivery_time_raw) vratil prazdny retezec.
-- Opravujeme pres NULLIF. Jinak je funkce beze zmeny.
CREATE OR REPLACE FUNCTION public.tg_notify_customer_brevo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_is_pickup boolean;
  v_pickup_address text;
  v_common jsonb;
begin
  if NEW.delivery_type = 'digital' then return NEW; end if;

  v_is_pickup := COALESCE(NEW.delivery_type, '') NOT ILIKE '%kurýrem%';

  v_common := jsonb_build_object(
    'order_id', COALESCE(NEW.order_id, NEW.id::text),
    'email', NEW.customer_email,
    'recipient_name', NEW.recipient_name,
    'products_text', NEW.products_text,
    'order_total', NEW.order_total,
    'delivery_date', NEW.delivery_date,
    'delivery_time', COALESCE(NULLIF(NEW.delivery_slot, ''), NULLIF(NEW.delivery_time_raw, ''))
  );

  IF NEW.status = 'confirmed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(v_common || jsonb_build_object(
      'event', CASE WHEN NEW.payment_method = 'stripe' THEN 'order_confirmed_stripe' ELSE 'order_confirmed_cod' END
    ));
  END IF;

  IF NEW.status = 'assembled' AND NEW.status IS DISTINCT FROM OLD.status AND v_is_pickup THEN
    SELECT address INTO v_pickup_address FROM warehouse_location WHERE id = true;
    PERFORM notify_brevo(v_common || jsonb_build_object(
      'event', 'pickup_ready',
      'pickup_address', v_pickup_address
    ));
  END IF;

  IF NEW.status = 'in_transit' AND NEW.status IS DISTINCT FROM OLD.status AND NOT v_is_pickup THEN
    PERFORM notify_brevo(v_common || jsonb_build_object('event', 'courier_out'));
  END IF;

  IF NEW.status = 'delivered' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(v_common || jsonb_build_object('event', 'delivered'));
  END IF;

  IF NEW.status = 'arriving' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM notify_brevo(jsonb_build_object(
      'event', 'arriving_sms',
      'order_id', COALESCE(NEW.order_id, NEW.id::text),
      'phone', NEW.recipient_phone
    ));
  END IF;

  IF NEW.status = 'cancelled' AND NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(NEW.customer_email, '') LIKE '%@%'
     AND NOT EXISTS (SELECT 1 FROM gift_links g WHERE g.order_id = NEW.order_id) THEN
    PERFORM notify_brevo(v_common || jsonb_build_object(
      'event', 'order_cancelled',
      'paid', NEW.payment_status::text LIKE '%Оплачено%',
      'pay_method', NEW.payment_method
    ));
  END IF;

  RETURN NEW;
END;
$function$;
