-- Автоотмена подарка без адреса через 48 ч не работала: gift_tick() каждые
-- 15 минут падал на gift_close() с
--   invalid input value for enum order_status: "?"
-- потому что tilda_orders.payment_status — enum order_status, а в тексте
-- уведомления стояло coalesce(o.payment_status, '?') (литерал '?' пытается
-- стать значением enum). Ошибка откатывала ВЕСЬ запуск gift_tick, поэтому
-- заказ висел "ждёт ответа" вечно и, что хуже, не уходили напоминания и по
-- остальным подаркам.
--
-- Патч поверх боевых определений (а не копия функций), чтобы остальной текст
-- остался байт-в-байт тем же; если определение в базе не такое, как
-- ожидается, миграция падает и ничего не меняет.
--   1) gift_close: приведение payment_status к тексту;
--   2) gift_close: если заказ уже закрыт вручную (delivered / cancelled /
--      not_home), его не отменяем, отправителю не пишем и деньги вернуть не
--      просим — подарок просто уходит из списка "ждёт ответа";
--   3) gift_tick: сбой на одном подарке не останавливает остальные.
DO $patch$
DECLARE
  d0 text;
  d text;
BEGIN
  d0 := pg_get_functiondef('public.gift_close(uuid,text)'::regprocedure);
  IF position('payment_status::text' in d0) = 0 THEN
    d := replace(d0, 'coalesce(o.payment_status, ''?'')', 'coalesce(o.payment_status::text, ''?'')');
    d := replace(d,
      E'  IF g.id IS NULL THEN RETURN; END IF;\n',
      E'  IF g.id IS NULL THEN RETURN; END IF;\n\n  -- Заказ уже закрыт вручную (доставлен / отменён / не застали): ничего не отменяем, не пишем отправителю и не просим вернуть деньги — просто убираем подарок из списка "ждёт ответа".\n  IF EXISTS (SELECT 1 FROM tilda_orders WHERE order_id = g.order_id AND status IN (''delivered'', ''cancelled'', ''not_home'')) THEN\n    UPDATE tilda_orders SET gift_status = p_status WHERE order_id = g.order_id;\n    RETURN;\n  END IF;\n');
    IF d = d0 OR position('payment_status::text' in d) = 0 OR position('''not_home''' in d) = 0 THEN
      RAISE EXCEPTION 'gift_close: определение в базе отличается от ожидаемого, патч не применён';
    END IF;
    EXECUTE d;
  END IF;

  d0 := pg_get_functiondef('public.gift_tick()'::regprocedure);
  IF position('EXCEPTION WHEN OTHERS' in d0) = 0 THEN
    d := replace(d0,
      E'ORDER BY created_at LOOP\n    v_age := now() - g.created_at;',
      E'ORDER BY created_at LOOP\n  BEGIN\n    v_age := now() - g.created_at;');
    d := replace(d,
      E'  END LOOP;\n\n  -- GDPR',
      E'  EXCEPTION WHEN OTHERS THEN\n    RAISE WARNING ''gift_tick: order % - %'', g.order_id, SQLERRM;\n  END;\n  END LOOP;\n\n  -- GDPR');
    IF d = d0 OR position(E'LOOP\n  BEGIN' in d) = 0 OR position('EXCEPTION WHEN OTHERS' in d) = 0 THEN
      RAISE EXCEPTION 'gift_tick: определение в базе отличается от ожидаемого, патч не применён';
    END IF;
    EXECUTE d;
  END IF;
END
$patch$;
