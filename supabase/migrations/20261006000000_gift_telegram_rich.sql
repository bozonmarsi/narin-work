-- Dárek bez adresy: pořádná zpráva do Telegramu.
--
-- Manažer dostane VŠECHNO v jedné zprávě: od koho, komu, kam psát, co se
-- posílá, hotový text pro příjemce (klepnutím se zkopíruje) a samotný odkaz,
-- plus tlačítka "💬 Otevřít chat" a "✅ Отправил" (označí odeslání bez aplikace).
--
-- Dosavadní notify_telegram posílá čistý text (bez HTML), proto vlastní
-- notify_telegram_html se stejným mechanismem (pg_net → /api/telegram/notify),
-- jen s parse_mode=HTML a tlačítky. Ostatní notifikace se nemění.

CREATE OR REPLACE FUNCTION notify_telegram_html(p_chat_id bigint, p_message text, p_markup jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_secret text;
BEGIN
  IF p_chat_id IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'telegram_webhook_secret';
  IF v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://narin-work.vercel.app/api/telegram/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('chat_id', p_chat_id, 'text', p_message, 'parse_mode', 'HTML')
            || CASE WHEN p_markup IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('reply_markup', p_markup) END
  );
END $$;

CREATE OR REPLACE FUNCTION notify_telegram_role_html(p_role text, p_message text, p_markup jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT telegram_chat_id FROM users WHERE role = p_role::user_role AND telegram_chat_id IS NOT NULL LOOP
    PERFORM notify_telegram_html(r.telegram_chat_id, p_message, p_markup);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION tg_esc(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

-- Text, který manažer pošle příjemci (stejný jako v aplikaci, GiftLinksPanel.tsx).
CREATE OR REPLACE FUNCTION gift_recipient_message(p_gift_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN nullif(btrim(g.recipient_name), '') IS NOT NULL
              THEN 'Dobrý den, ' || split_part(btrim(g.recipient_name), ' ', 1) || ',' ELSE 'Dobrý den,' END
      || ' tady květinářství NARIN (vezminarin.cz). '
      || CASE WHEN g.sender_name_visible AND nullif(btrim(g.sender_name), '') IS NOT NULL
              THEN split_part(btrim(g.sender_name), ' ', 1) ELSE 'Někdo' END
      || ' vám posílá kytici 💐 Kam a kdy vám ji máme přivézt? Zadejte to prosím tady (platí 48 hodin): '
      || 'https://vezminarin.cz/prijem-daru?t=' || g.token
      || E'\n\n' || 'Váš kontakt nám dal odesílatel a použijeme ho jen kvůli tomuto doručení. '
      || 'Nechcete-li dárek, klikněte v odkazu na „Dárek nechci“ nebo odepište STOP. https://vezminarin.cz/ochrana-osobnich-udaju'
  FROM gift_links g WHERE g.id = p_gift_id;
$$;

-- Odkaz pro tlačítko "Otevřít chat" (Telegram povolí jen http/https — u SMS tlačítko není).
CREATE OR REPLACE FUNCTION gift_contact_url(p_channel text, p_handle text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_handle IS NULL OR btrim(p_handle) = '' THEN NULL
    WHEN p_channel = 'whatsapp' THEN 'https://wa.me/' ||
      CASE WHEN length(regexp_replace(p_handle, '\D', '', 'g')) = 9 THEN '420' ELSE '' END || regexp_replace(p_handle, '\D', '', 'g')
    WHEN p_channel = 'telegram' AND p_handle ~ '[A-Za-z]' THEN 'https://t.me/' || regexp_replace(btrim(p_handle), '^@', '')
    WHEN p_channel = 'telegram' THEN 'https://t.me/+' ||
      CASE WHEN length(regexp_replace(p_handle, '\D', '', 'g')) = 9 THEN '420' ELSE '' END || regexp_replace(p_handle, '\D', '', 'g')
    WHEN p_channel = 'instagram' THEN 'https://ig.me/m/' || regexp_replace(btrim(p_handle), '^@', '')
    ELSE NULL END;
$$;

-- Nový dárek → jedna přehledná zpráva každému manažerovi.
CREATE OR REPLACE FUNCTION gift_notify_new(p_order_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      coalesce(' · ' || o.order_total::int || ' Kč', '') || coalesce(' · ' || tg_esc(o.payment_status), '') || E'\n' ||
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
END $$;
REVOKE ALL ON FUNCTION gift_notify_new(text) FROM PUBLIC, anon, authenticated;

-- Tlačítko "✅ Отправил" v Telegramu (volá /api/telegram/webhook po ověření
-- tajného klíče Telegramu). Pustí jen chat, který patří manažerovi.
CREATE OR REPLACE FUNCTION gift_mark_sent_tg(p_gift_id uuid, p_chat_id bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  SELECT coalesce(full_name, 'менеджер') INTO v_name FROM users
  WHERE telegram_chat_id = p_chat_id AND role = 'manager'::user_role LIMIT 1;
  IF v_name IS NULL THEN RETURN NULL; END IF;
  UPDATE gift_links SET manager_sent_at = now() WHERE id = p_gift_id AND status = 'awaiting_input';
  RETURN v_name;
END $$;
REVOKE ALL ON FUNCTION gift_mark_sent_tg(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gift_mark_sent_tg(uuid, bigint) TO anon, authenticated;

CREATE OR REPLACE FUNCTION gift_close(p_gift_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g gift_links%ROWTYPE;
  o record;
  v_reason text := CASE WHEN p_status = 'opted_out' THEN 'Zrušeno — příjemce dárek odmítl' ELSE 'Zrušeno — dárek nevyzvednut' END;
BEGIN
  UPDATE gift_links SET status = p_status, closed_at = now()
  WHERE id = p_gift_id AND status = 'awaiting_input'
  RETURNING * INTO g;
  IF g.id IS NULL THEN RETURN; END IF;

  UPDATE tilda_orders SET status = 'cancelled', cancelled_reason = v_reason, gift_status = p_status, recipient_phone = NULL
  WHERE order_id = g.order_id
  RETURNING order_id, customer_email, order_total, used_points, payment_method, payment_status INTO o;

  -- uplatněné body zpět (jednou)
  IF coalesce(o.used_points, 0) > 0 AND coalesce(o.customer_email, '') <> ''
     AND NOT EXISTS (SELECT 1 FROM points_transactions WHERE order_id = g.order_id AND type = 'gift_refund') THEN
    UPDATE "Tilda points" SET balance = balance + o.used_points WHERE lower(email) = lower(o.customer_email);
    INSERT INTO points_transactions (user_email, amount, type, order_id, description)
    VALUES (lower(o.customer_email), o.used_points, 'gift_refund', g.order_id, 'Vrácení bodů — ' || v_reason);
  END IF;

  PERFORM notify_telegram_role_html('manager',
    '💸 <b>Подарок без адреса отменён</b>' || E'\n' ||
    'Заказ <code>' || g.order_id || '</code>: ' || CASE WHEN p_status = 'opted_out' THEN 'получатель отказался' ELSE 'за 48 ч адрес не указали' END || E'\n' ||
    'Верните деньги отправителю: <b>' || coalesce(o.order_total, 0)::int || ' Kč</b> (' || coalesce(o.payment_method, '?') || ', ' || coalesce(o.payment_status, '?') || ')' ||
    CASE WHEN coalesce(o.used_points, 0) > 0 THEN E'\nБаллы (' || o.used_points || ') уже вернули автоматически.' ELSE '' END);

  IF coalesce(o.customer_email, '') <> '' THEN
    PERFORM notify_brevo(jsonb_build_object('event', 'gift_cancelled', 'order_id', g.order_id, 'email', lower(o.customer_email),
      'recipient_name', g.recipient_name, 'order_total', o.order_total, 'reason', p_status));
  END IF;
END $$;

-- připomínky manažerům teď s HTML a tlačítkem
CREATE OR REPLACE FUNCTION gift_tick()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record;
  v_n int := 0;
  v_age interval;
BEGIN
  FOR g IN SELECT * FROM gift_links WHERE status = 'awaiting_input' ORDER BY created_at LOOP
    v_age := now() - g.created_at;

    IF now() >= g.expires_at THEN
      PERFORM gift_close(g.id, 'expired'); v_n := v_n + 1; CONTINUE;
    END IF;

    -- manažer ještě neposlal odkaz: připomínat každých 30 min
    IF g.manager_sent_at IS NULL AND v_age >= interval '30 minutes'
       AND (g.manager_escalated_at IS NULL OR g.manager_escalated_at <= now() - interval '30 minutes') THEN
      PERFORM notify_telegram_role_html('manager',
        '⏰ <b>Подарок без адреса ещё НЕ отправлен получателю!</b>' || E'\n' ||
        'Заказ <code>' || g.order_id || '</code>, ждёт ' || floor(extract(epoch FROM v_age) / 60)::int || ' мин.' || E'\n' ||
        'Текст и ссылка — в сообщении 🎁 выше или в приложении. Отправили — нажмите кнопку.',
        jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
          jsonb_build_object('text', '✅ Отправил', 'callback_data', 'gs:' || g.id)))));
      UPDATE gift_links SET manager_escalated_at = now() WHERE id = g.id;
      v_n := v_n + 1;
    END IF;

    -- příjemce mlčí: připomínka manažerovi po 3 h a 12 h
    IF g.manager_sent_at IS NOT NULL AND v_age >= interval '3 hours' AND NOT g.reminder_3h_sent THEN
      PERFORM notify_telegram_role_html('manager', '🔔 Получатель подарка <code>' || g.order_id || '</code> молчит 3 ч. Напишите ему ещё раз (ссылка в приложении).');
      UPDATE gift_links SET reminder_3h_sent = true WHERE id = g.id; v_n := v_n + 1;
    END IF;
    IF g.manager_sent_at IS NOT NULL AND v_age >= interval '12 hours' AND NOT g.reminder_12h_sent THEN
      PERFORM notify_telegram_role_html('manager', '🔔 Получатель подарка <code>' || g.order_id || '</code> молчит 12 ч. Последнее напоминание; через 24 ч напишем отправителю.');
      UPDATE gift_links SET reminder_12h_sent = true WHERE id = g.id; v_n := v_n + 1;
    END IF;

    -- po 24 h: odesílatel může zadat adresu sám
    IF v_age >= interval '24 hours' AND g.sender_notified_at IS NULL THEN
      IF coalesce(g.sender_email, '') <> '' THEN
        PERFORM notify_brevo(jsonb_build_object('event', 'gift_sender_fallback', 'order_id', g.order_id, 'email', g.sender_email,
          'recipient_name', g.recipient_name, 'sender_link', 'https://vezminarin.cz/prijem-daru?s=' || g.sender_token,
          'expires_at', to_char(g.expires_at AT TIME ZONE 'Europe/Prague', 'DD. MM. HH24:MI')));
      END IF;
      UPDATE gift_links SET sender_notified_at = now() WHERE id = g.id; v_n := v_n + 1;
    END IF;
  END LOOP;

  -- GDPR: kontakt příjemce smazat 30 dní po uzavření
  -- (i ze surových dat objednávky; u nedoručených i telefon příjemce)
  WITH p AS (
    UPDATE gift_links SET recipient_handle = NULL, purged_at = now()
    WHERE purged_at IS NULL AND coalesce(closed_at, CASE WHEN status <> 'awaiting_input' THEN created_at END) < now() - interval '30 days'
    RETURNING order_id, status
  )
  UPDATE tilda_orders o
  SET raw_payload = CASE WHEN p.status IN ('expired', 'opted_out')
                         THEN o.raw_payload - 'gift-handle' - 'recipients-phone-number'
                         ELSE o.raw_payload - 'gift-handle' END
  FROM p WHERE o.order_id = p.order_id;
  RETURN v_n;
END $$;

-- trigger: místo krátké zprávy ta plná
CREATE OR REPLACE FUNCTION gift_orders_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p jsonb := coalesce(NEW.raw_payload, '{}'::jsonb);
  v_channel text := CASE WHEN p->>'gift-channel' IN ('telegram', 'whatsapp', 'instagram', 'phone') THEN p->>'gift-channel' ELSE 'phone' END;
  v_handle text := nullif(btrim(coalesce(p->>'gift-handle', NEW.recipient_phone, p->>'recipients-phone-number', '')), '');
  v_name text := coalesce(nullif(btrim(p->>'gift-recipient-name'), ''), nullif(btrim(NEW.recipient_name), ''));
  v_hash text := gift_contact_hash(v_handle);
  v_token text := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40);
BEGIN
  IF NEW.gift_status IS DISTINCT FROM 'awaiting_input' OR coalesce(NEW.order_id, '') IN ('', 'no_id') THEN RETURN NEW; END IF;
  -- cokoli tady selže, nesmí shodit příjem objednávky
  BEGIN
  IF EXISTS (SELECT 1 FROM gift_links WHERE order_id = NEW.order_id) THEN RETURN NEW; END IF;

  INSERT INTO gift_links (order_id, token, sender_token, recipient_channel, recipient_handle, recipient_name, contact_hash,
                          sender_name, sender_name_visible, sender_email, min_delivery_date)
  VALUES (NEW.order_id, v_token, left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40),
          v_channel, v_handle, v_name, v_hash,
          nullif(btrim(coalesce(p->>'senders-name-postcard', NEW.customer_name, p->>'name', '')), ''),
          coalesce(p->>'gift-sender-visible', 'yes') <> 'no',
          nullif(lower(btrim(coalesce(NEW.customer_email, ''))), ''),
          gift_min_date(NEW.order_id))
  ON CONFLICT (order_id) DO NOTHING;

  PERFORM gift_notify_new(NEW.order_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'gift_orders_after % failed: %', NEW.order_id, SQLERRM;
  END;
  RETURN NEW;
END $$;

-- Zpráva "adresa zadána" jde odtud (trigger), ať adresu potvrdí příjemce přes
-- gift-link, nebo kdokoli jiný; edge funkce ji sama už neposílá.
CREATE OR REPLACE FUNCTION gift_links_after_confirm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF NEW.status IN ('confirmed', 'sender_manual') AND OLD.status = 'awaiting_input' THEN
    SELECT address, city, psk, patro, cislo_bytu, kod_intercomu, recipient_phone INTO o FROM tilda_orders WHERE order_id = NEW.order_id;
    BEGIN
      PERFORM notify_telegram_role_html('manager',
        '✅ <b>Адрес для подарка указан</b> (' || CASE WHEN NEW.status = 'confirmed' THEN 'получатель' ELSE 'отправитель' END || ')' || E'\n' ||
        'Заказ <code>' || tg_esc(NEW.order_id) || '</code> · ' || coalesce(tg_esc(NEW.recipient_name), '') || E'\n' ||
        '📍 ' || tg_esc(coalesce(NEW.recipient_address, o.address)) ||
          CASE WHEN coalesce(o.patro, '') <> '' THEN ', этаж ' || tg_esc(o.patro) ELSE '' END ||
          CASE WHEN coalesce(o.cislo_bytu, '') <> '' THEN ', кв. ' || tg_esc(o.cislo_bytu) ELSE '' END ||
          CASE WHEN coalesce(o.kod_intercomu, '') <> '' THEN ', звонок ' || tg_esc(o.kod_intercomu) ELSE '' END || E'\n' ||
        '🗓 ' || to_char(NEW.delivery_date, 'DD.MM.YYYY') || ' · ' || tg_esc(NEW.recipient_slot) ||
        CASE WHEN coalesce(o.recipient_phone, '') <> '' THEN E'\n📞 <code>' || tg_esc(o.recipient_phone) || '</code>' ELSE '' END || E'\n\n' ||
        'Подтвердите заказ в приложении — дальше как обычно.');
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'gift confirm notify failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gift_links_after_confirm ON gift_links;
CREATE TRIGGER gift_links_after_confirm AFTER UPDATE ON gift_links
  FOR EACH ROW EXECUTE FUNCTION gift_links_after_confirm();
