-- "Darek bez adresy": odkaz pro prijemce se nevytvoril a manazeri nedostali zpravu do Telegramu.
-- Pricina: gift_notify_new volala tg_esc(o.payment_status), ale payment_status je ENUM (order_status)
-- a tg_esc umi jen text -> chyba "function tg_esc(order_status) does not exist". Vyjimku zachytil
-- gift_orders_after (aby nespadl prijem objednavky) a tim se vratil zpet i INSERT do gift_links.
-- Oprava: pretypovani ::text. Jinak je funkce beze zmeny.
CREATE OR REPLACE FUNCTION public.gift_notify_new(p_order_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g gift_links%ROWTYPE;
  o record;
  v_channel text;
  v_url text;
  v_blocked boolean;
  v_kb jsonb := '[]'::jsonb;
  v_msg text;
BEGIN
  SELECT * INTO g FROM gift_links WHERE order_id = p_order_id;
  IF g.id IS NULL THEN RETURN; END IF;
  SELECT order_total, payment_status, products_text, customer_phone, customer_email INTO o FROM tilda_orders WHERE order_id = p_order_id;
  v_channel := CASE g.recipient_channel WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'telegram' THEN 'Telegram' WHEN 'instagram' THEN 'Instagram' ELSE 'SMS / звонок' END;
  v_url := gift_contact_url(g.recipient_channel, g.recipient_handle);
  v_blocked := g.contact_hash IS NOT NULL AND EXISTS (SELECT 1 FROM gift_do_not_contact WHERE contact_hash = g.contact_hash);

  v_msg :=
    CASE WHEN v_blocked THEN '⛔️ <b>Этот контакт раньше отказался от подарков без адреса!</b> Не пишите ему — свяжитесь с отправителем.' || E'\n\n' ELSE '' END ||
    '🎁 <b>ПОДАРОК БЕЗ АДРЕСА</b>' || E'\n' ||
    'Заказ <code>' || tg_esc(g.order_id) || '</code>' ||
      coalesce(' · ' || o.order_total::int || ' Kč', '') || coalesce(' · ' || tg_esc(o.payment_status::text), '') || E'\n' ||
    '━━━━━━━━━━━━━━' || E'\n' ||
    '👤 <b>От:</b> ' || tg_esc(coalesce(g.sender_name, '—')) ||
      CASE WHEN g.sender_name_visible THEN ' <i>(имя покажем)</i>' ELSE ' <i>(анонимно)</i>' END || E'\n' ||
    '💐 <b>Кому:</b> ' || tg_esc(coalesce(g.recipient_name, '—')) || E'\n' ||
    '📲 <b>Куда писать:</b> ' || v_channel || E'\n' ||
    CASE WHEN g.recipient_handle IS NULL
         THEN '⚠️ Контакт получателя не пришёл — спросите у отправителя: <code>' || tg_esc(coalesce(o.customer_phone, o.customer_email, '?')) || '</code>' || E'\n'
         ELSE '<code>' || tg_esc(g.recipient_handle) || '</code>' || E'\n' END ||
    CASE WHEN coalesce(o.products_text, '') <> '' THEN '🛒 ' || tg_esc(o.products_text) || E'\n' ELSE '' END ||
    '⏳ Ссылка действует до <b>' || to_char(g.expires_at AT TIME ZONE 'Europe/Prague', 'DD.MM HH24:MI') || '</b>' || E'\n\n' ||
    '<b>① Текст для получателя</b> — нажмите на него, скопируется целиком:' || E'\n' ||
    '<pre>' || tg_esc(gift_recipient_message(g.id)) || '</pre>' || E'\n\n' ||
    '<b>② Только ссылка:</b>' || E'\n' ||
    '<code>https://vezminarin.cz/prijem-daru?t=' || g.token || '</code>' || E'\n\n' ||
    '<b>③</b> Отправили — нажмите «✅ Отправил» (напоминания прекратятся).';

  IF v_url IS NOT NULL AND NOT v_blocked THEN
    v_kb := v_kb || jsonb_build_array(jsonb_build_array(jsonb_build_object('text', '💬 Открыть ' || v_channel, 'url', v_url)));
  END IF;
  v_kb := v_kb || jsonb_build_array(jsonb_build_array(jsonb_build_object('text', '✅ Отправил', 'callback_data', 'gs:' || g.id)));

  PERFORM notify_telegram_role_html('manager', v_msg, jsonb_build_object('inline_keyboard', v_kb));
END $function$;

-- Znovu spustit vytvoreni odkazu pro objednavku 1052288323 (stav uz je awaiting_input, odkaz chybi)
UPDATE tilda_orders SET gift_status = 'awaiting_input' WHERE order_id = '1052288323' AND gift_status = 'awaiting_input';

SELECT order_id, status, gift_status,
       (SELECT 'https://vezminarin.cz/prijem-daru?t=' || token FROM gift_links WHERE order_id = '1052288323') AS odkaz
FROM tilda_orders WHERE order_id = '1052288323';
