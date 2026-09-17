import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

// Cashback по уровню — те же пороги/проценты, что показаны клиенту на
// карте лояльности (tilda/blocks/loyalty-card.html). До 2026-09-04
// реально начислялся всегда флэт 1% независимо от уровня, хотя карта
// обещала 0.5/1/1.5/2% — теперь начисление действительно растёт с
// уровнем.
const TIERS = [
  { threshold: 0, cashback: 0.5 },
  { threshold: 300, cashback: 1 },
  { threshold: 600, cashback: 1.5 },
  { threshold: 900, cashback: 2 },
];

function getCashbackPercent(totalEarned: number): number {
  let cashback = TIERS[0].cashback;
  for (const t of TIERS) {
    if (totalEarned >= t.threshold) cashback = t.cashback;
  }
  return cashback;
}

// Стало 2026-09-17: get_promo раньше принимал голый email в теле запроса
// и отдавал по нему баланс баллов (message: "Nedostatek bodů. Máte: N")
// без всякой проверки владения — тот же класс дыры, что был в member-data
// до фикса 2026-09-04. Приём заказа от самой Tilda (ниже по файлу) email
// по-прежнему берёт из тела запроса как есть — это server-to-server вызов
// от платёжной системы, а не от браузера клиента, токена там нет и не
// нужно. Токен нужен только для get_promo, потому что его дёргает JS
// прямо со страницы оплаты.
const encoder = new TextEncoder();

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const expectedSigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  if (expectedSigB64 !== sigB64) return null;
  try {
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload.email;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const textBody = await req.text();
    let data: any;
    try {
      data = JSON.parse(textBody);
    } catch {
      data = Object.fromEntries(new URLSearchParams(textBody).entries());
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rawEmail = data.ma_email || data.email || "";
    const cleanEmail = String(rawEmail).trim().toLowerCase();
    const action = data.action;
    const botToken = "8757094631:AAFst6vMS7DZID0KyuOq1Zcht7LVKGZl7AE";
    const chatId = "-5182549253";

    // --- ЛОГИКА Б: КОРЗИНА (ПРОВЕРКА) ---
    if (action === 'get_promo') {
      const token = data.token;
      if (!token) {
        return new Response(JSON.stringify({ status: 'error', message: 'Chybí token, přihlaste se prosím.' }), { status: 200, headers: corsHeaders });
      }
      const verifiedEmail = await verifyToken(token, Deno.env.get('AUTH_TOKEN_SECRET')!);
      if (!verifiedEmail) {
        return new Response(JSON.stringify({ status: 'error', message: 'Neplatný token, přihlaste se prosím znovu.' }), { status: 200, headers: corsHeaders });
      }

      const pointsToSpend = Number(data.amount || 0);
      const totalOrderSum = Number(data.total_sum || data.amount_total || data.total || 0);

      const { data: userData } = await supabase.from('Tilda points').select('balance').ilike('email', verifiedEmail).maybeSingle();
      if (!userData) return new Response(JSON.stringify({ status: 'error', message: 'Uživatel nenalezen.' }), { status: 200, headers: corsHeaders });

      const currentBalance = Number(userData.balance || 0);
      if (pointsToSpend > currentBalance) return new Response(JSON.stringify({ status: 'error', message: `Nedostatek bodů. Máte: ${currentBalance}` }), { status: 200, headers: corsHeaders });

      if (totalOrderSum > 0) {
        const maxAllowed = Math.floor(totalOrderSum * 0.3);
        if (pointsToSpend > maxAllowed) return new Response(JSON.stringify({ status: 'error', message: `Body lze uplatnit pouze do výše 30% z celkové částky. Maximalně můžete použit ${maxAllowed}` }), { status: 200, headers: corsHeaders });
      }

      if (data.check_only === true) {
        return new Response(JSON.stringify({ status: 'success', message: 'Body ověřeny.' }), { status: 200, headers: corsHeaders });
      }
    }

    // --- ЛОГИКА В: ПРИЕМ ЗАКАЗА ---
    const p = data.payment || {};
    const decodeHtml = (str: string) => {
      if (!str) return "";
      const ent: any = { '&aacute;':'á','&iacute;':'í','&yacute;':'ý','&eacute;':'é','&oacute;':'ó','&uacute;':'ú','&scaron;':'š','&Aacute;':'Á','&Iacute;':'Í','&Yacute;':'Ý','&Eacute;':'É','&Oacute;':'O','&Uacute;':'Ú','&Scaron;':'Š' };
      return str.replace(/&[a-z]+;/g, (m) => ent[m] || m);
    };

    let formattedDate = null;
    if (data.date) {
      const cleanDate = data.date.replace(/\./g, '-');
      const dateParts = cleanDate.split('-');
      if (dateParts.length === 3) formattedDate = dateParts[2].length === 4 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
    }

    const oid = String(p.orderid || data.orderid || "no_id");
    const paySys = (data.paymentsystem || "").toLowerCase();
    const isPaid = paySys.includes("stripe");
    const totalAmt = Number(p.amount || data.amount || 0);

    // Уровень (и, соответственно, ставку кэшбека) определяем по тому,
    // сколько баллов клиент заработал ДО этого заказа — тот же принцип,
    // что и на карте лояльности (totalEarned = сумма всех начислений,
    // не текущий баланс, чтобы списание баллов не откатывало уровень).
    let totalEarnedSoFar = 0;
    if (cleanEmail) {
      const { data: pastAccruals } = await supabase
        .from("points_transactions")
        .select("amount")
        .ilike("user_email", cleanEmail)
        .gt("amount", 0);
      totalEarnedSoFar = (pastAccruals ?? []).reduce((sum: number, r: any) => sum + r.amount, 0);
    }
    const cashbackPercent = getCashbackPercent(totalEarnedSoFar);
    const earnedPoints = Math.floor(totalAmt * cashbackPercent / 100);

    // --- УМНЫЙ ПОИСК БАЛЛОВ В ПРОМОКОДЕ (ИСПРАВЛЕНО) ---
    let spentFromPromo = 0;
    const promoValue = String(data.promocode || (p && p.promocode) || data.discount || "").trim();

    if (promoValue.toLowerCase().startsWith("uplatn")) {
      const match = promoValue.match(/\d+/);
      spentFromPromo = match ? Number(match[0]) : 0;
    }

    // --- ПРОВЕРКА ДУБЛЯ ПЕРЕД ОБРАБОТКОЙ ---
    // Смотрим, не отправляли ли уже уведомление по этому order_id
    let alreadyNotified = false;
    if (oid && oid !== "no_id") {
      const { data: existing } = await supabase
        .from("tilda_orders")
        .select("tg_notified")
        .eq("order_id", oid)
        .maybeSingle();
      if (existing && existing.tg_notified === true) {
        alreadyNotified = true;
      }
    }

    const orderData = {
      order_id: oid,
      customer_name: data.name || "",
      customer_last_name: data.lastname || data["last-name"] || "",
      customer_phone: data.phone || "",
      customer_email: cleanEmail,
      // --- НОВЫЕ ПОЛЯ ДЛЯ ОТКРЫТКИ ---
      senders_name_postcard: data["senders-name-postcard"] || data.senders_name_postcard || "",
      recipients_name_postcard: data["recipients-name-postcard"] || data.recipients_name_postcard || "",
      postcard_comment: data["postcard-comment"] || data.postcard_comment || "",
      // ------------------------------
      recipient_name: data["recipients-name"] || "",
      recipient_phone: data["recipients-phone-number"] || "",
      delivery_type: data.delivery || "",
      delivery_date: formattedDate,
      delivery_time_raw: data.time || "",
      delivery_slot: data["delivery-time"] || "",
      address: data.adres || "",
      city: data.city || "",
      psk: data.psc || "",
      patro: data.floor || "",
      cislo_bytu: data["apartment-number"] || "",
      kod_intercomu: data.intercom || "",
      comments: data.comments || data.comment || "",
      products_text: Array.isArray(p.products) ? p.products.map((item: any) => `${decodeHtml(item.name)} x ${item.quantity}`).join('\n') : "",
      company_name: (data["company-name"] || data.company_name || "").trim() || "",
      // Устанавливаем стартовый статус. Если это Stripe и оплата уже прошла — ставим "Оплачено",
      // во всех остальных случаях (наличные, ожидание Stripe) — "Не оплачено".
      payment_status: paySys.includes("stripe") ? "🟠 Ожидает оплаты" : "🔴 Не оплачено",
      earned_points: earnedPoints,
      used_points: spentFromPromo,
      goods_total: Number(p.subtotal || 0),
      order_total: totalAmt,
      payment_method: data.paymentsystem || "",
      raw_payload: data
    };
    // ВАЖНО: Добавляем проверку ошибки при записи
    const { error: dbError } = await supabase.from("tilda_orders").upsert(orderData, { onConflict: 'order_id' });
    if (dbError) {
      console.error("ОШИБКА БАЗЫ:", dbError.message);
      // Если база не приняла заказ, мы всё равно отправим сообщение в ТГ,
      // но в логах Супабейза ты увидишь причину (например, слишком длинный статус)
    }
    // Сохраняем или обновляем данные заказа
    await supabase.from("tilda_orders").upsert(orderData, { onConflict: 'order_id' });

    // --- ЛОГИКА А: СПИСАНИЕ БАЛЛОВ (Redemption) ---
    // Срабатывает сразу, если в заказе использован промокод на баллы
    if (cleanEmail && spentFromPromo > 0) {
      const { data: alreadySpent } = await supabase.from("points_transactions")
        .select("id")
        .eq("order_id", oid)
        .eq("type", "redemption")
        .maybeSingle();

      if (!alreadySpent) {
        const { data: userRec } = await supabase.from('Tilda points')
          .select('balance')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (userRec) {
          const newBal = Number(userRec.balance || 0) - spentFromPromo;
          // Обновляем баланс пользователя
          await supabase.from('Tilda points').update({ balance: newBal }).eq('email', cleanEmail);
          // Записываем транзакцию списания
          await supabase.from("points_transactions").insert({
            user_email: cleanEmail,
            amount: -spentFromPromo,
            type: 'redemption',
            order_id: oid,
            description: `Sepsání за заказ ${oid}`
          });
        }
      }
    }

    // Если уже отправляли — выходим, в ТГ не шлём
    if (alreadyNotified) {
      return new Response(JSON.stringify({ status: "ok", note: "duplicate skipped" }), { status: 200, headers: corsHeaders });
    }

    const rows: string[] = [];
    rows.push(`<b>📦 НОВЫЙ ЗАКАЗ</b>`);
    rows.push(`━━━━━━━━━━━━━━━━`);
    rows.push(`ID: <code>${oid}</code>\n`);

    if (data.name) rows.push(`👤 Имя: ${data.name} ${data.lastname || ""}`);
    if (orderData.company_name && orderData.company_name !== "EMPTY") rows.push(`🏢 Фирма: ${orderData.company_name}`);
    if (data.phone) rows.push(`📞 Тел: ${data.phone}`);
    if (cleanEmail) rows.push(`📧 Email: ${cleanEmail}`);

    if (spentFromPromo > 0) rows.push(`\n<b>➖ Списано баллов: ${spentFromPromo}</b>`);
    if (isPaid && earnedPoints > 0) rows.push(`<b>➕ Начислено баллов: ${earnedPoints}</b>`);

    rows.push("");

    if (data["recipients-name"]) {
      rows.push(`👥 <b>ПОЛУЧАТЕЛЬ:</b>`);
      rows.push(`Имя: ${data["recipients-name"]} ${data["recipients-lastname"] || ""}`);
      if (data["recipients-phone-number"]) rows.push(`Тел: ${data["recipients-phone-number"]}`);
      rows.push("");
    }

    // Определяем способ доставки по тексту
    const rawDelivery = data.delivery || "";
    let deliveryDisplay = "Не указан";
    if (rawDelivery.includes("239")) {
      deliveryDisplay = "Доставка курьером";
    } else if (rawDelivery.includes("80")) {
      deliveryDisplay = "Самовывоз";
    } else {
      deliveryDisplay = rawDelivery;
    }

    // Собираем время (проверяем оба возможных поля)
    const deliveryTime = data["delivery-time"] || data.time || "не указано";

    rows.push(`📍 <b>ИНФО О ПОЛУЧЕНИИ:</b>`);
    rows.push(`Способ: ${deliveryDisplay}`);
    if (data.date) rows.push(`Дата: ${data.date}`);
    rows.push(`Время: ${deliveryTime}`);

    // Если это доставка, показываем адрес
    if (deliveryDisplay.includes("курьером")) {
      if (data.city) rows.push(`Город: ${data.city}`);
      if (data.adres) rows.push(`Адрес: ${data.adres}`);
      if (data.floor) rows.push(`Этаж: ${data.floor}`);
      if (data["apartment-number"]) rows.push(`Кв: ${data["apartment-number"]}`);
      if (data.intercom) rows.push(`Домофон: ${data.intercom}`);
      if (data.comments) rows.push(`Комментарий: ${data.comments}`);
    }
    // Блок открытки — показываем только если заполнен комментарий (текст открытки)
    if (data["postcard-comment"] || data.postcard_comment) {
      rows.push(`\n📝 <b>ИНФО НА ОТКРЫТКЕ:</b>`);

      const sName = data["senders-name-postcard"] || data.senders_name_postcard;
      const rName = data["recipients-name-postcard"] || data.recipients_name_postcard;
      const pText = data["postcard-comment"] || data.postcard_comment;

      if (sName) rows.push(`От кого: ${sName}`);
      if (rName) rows.push(`Кому: ${rName}`);
      if (pText) rows.push(`Текст: <i>${pText}</i>`);
    }
    rows.push(`\n💳 Оплата: ${data.paymentsystem || "Не указан"}`);

    if (orderData.products_text) {
      rows.push(`\n🛒 <b>ТОВАРЫ:</b>\n${orderData.products_text}`);
    }

    rows.push(`\n🎟 Промокод: <code>${promoValue || "нет"}</code>`);
    rows.push(`\n💰 <b>ИТОГО: ${totalAmt} CZK</b>`);
    rows.push(`━━━━━━━━━━━━━━━━`);
    rows.push(`${orderData.payment_status}`);

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: rows.join('\n'), parse_mode: "HTML" })
    });

    // После успешной отправки ставим флаг
    if (tgResp.ok && oid && oid !== "no_id") {
      await supabase
        .from("tilda_orders")
        .update({ tg_notified: true })
        .eq("order_id", oid);
    }

    return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), { status: 200, headers: corsHeaders });
  }
});
