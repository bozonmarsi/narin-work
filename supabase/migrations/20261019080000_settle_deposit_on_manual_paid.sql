-- Kdyz je objednavka s odlozenym depozitem (pending_deposit) oznacena jako zaplacena JINOU cestou nez
-- pres settle_order_payment (napr. rucne v NARIN WORK), depozit se nikdy neodepsal a zakaznik
-- ho mel zdarma. Tento trigger odepise depozit pri prechodu na "Oplaceno". settle_order_payment
-- nuluje pending_deposit ve stejnem UPDATE, takze se nikdy neodepise dvakrat.
CREATE OR REPLACE FUNCTION public.tg_settle_deposit_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_balance numeric;
  v_spend numeric := 0;
BEGIN
  IF coalesce(NEW.pending_deposit, 0) > 0
     AND coalesce(NEW.payment_status::text, '') LIKE '%Оплачено%'
     AND coalesce(OLD.payment_status::text, '') NOT LIKE '%Оплачено%' THEN
    v_email := lower(btrim(coalesce(NEW.customer_email, '')));
    SELECT balance INTO v_balance FROM customer_deposits WHERE lower(email) = v_email FOR UPDATE;
    v_spend := least(NEW.pending_deposit, greatest(coalesce(v_balance, 0), 0));
    IF v_spend > 0 THEN
      UPDATE customer_deposits SET balance = balance - v_spend, updated_at = now() WHERE lower(email) = v_email;
      INSERT INTO deposit_transactions (user_email, amount, type, order_id, description)
      VALUES (v_email, -v_spend, 'order', NEW.order_id, 'Platba objednávky ' || NEW.order_id)
      ON CONFLICT DO NOTHING;
    END IF;
    IF v_spend < NEW.pending_deposit THEN
      PERFORM notify_telegram_role('manager',
        '⚠️ <b>Депозит списан не полностью</b> <code>' || NEW.order_id || '</code>: нужно было ' ||
        NEW.pending_deposit::int || ' Kč, на депозите ' || v_spend::int || ' Kč. Проверьте вручную.');
    END IF;
    NEW.used_deposit := v_spend;
    NEW.pending_deposit := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_settle_deposit_on_paid ON tilda_orders;
CREATE TRIGGER aa_settle_deposit_on_paid
BEFORE UPDATE OF payment_status ON tilda_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_settle_deposit_on_paid();
