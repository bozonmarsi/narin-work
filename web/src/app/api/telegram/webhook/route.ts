import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage, telegramApi } from "@/lib/telegram";

type InlineButton = { text: string; url?: string; callback_data?: string };

// Tlačítko "✅ Отправил" u zprávy o dárku bez adresy (SQL gift_notify_new).
// Ověření, že jde o manažera, dělá gift_mark_sent_tg podle chat_id.
async function handleCallback(cb: {
  id: string;
  data?: string;
  message?: { chat?: { id: number }; message_id?: number; reply_markup?: { inline_keyboard?: InlineButton[][] } };
}) {
  const data = cb.data ?? "";
  const chatId = cb.message?.chat?.id;
  if (data === "noop" || !chatId) {
    await telegramApi("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }
  const m = data.match(/^gs:([0-9a-f-]{36})$/);
  if (!m) {
    await telegramApi("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: who, error } = await supabase.rpc("gift_mark_sent_tg", { p_gift_id: m[1], p_chat_id: chatId });
  if (error || !who) {
    await telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Не получилось отметить. Отметьте в приложении.", show_alert: true });
    return;
  }
  await telegramApi("answerCallbackQuery", { callback_query_id: cb.id, text: "✅ Отмечено. Напоминания остановлены." });
  // tlačítko nahradit štítkem "Отправлено", odkaz na chat nechat
  const time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
  const rows = (cb.message?.reply_markup?.inline_keyboard ?? []).map((row) =>
    row.map((b) => (b.callback_data === data ? { text: `✅ Отправлено · ${who} · ${time}`, callback_data: "noop" } : b)),
  );
  await telegramApi("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: cb.message?.message_id,
    reply_markup: { inline_keyboard: rows },
  });
}

// Telegram calls this whenever someone messages the bot. We only handle
// "/start <code>" — the code comes from each staff member's own account (see
// the "Подключить Telegram" bit in the dashboard header) and links their
// chat_id via a narrow SECURITY DEFINER function, no service-role key
// involved.
export async function POST(request: Request) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const update = await request.json();
  if (update?.callback_query) {
    await handleCallback(update.callback_query);
    return Response.json({ ok: true });
  }
  const message = update?.message;
  const chatId: number | undefined = message?.chat?.id;
  const text: string | undefined = message?.text;

  if (!chatId || !text) {
    return Response.json({ ok: true });
  }

  const match = text.trim().match(/^\/start\s+(\S+)/);
  if (!match) {
    await sendTelegramMessage(chatId, "Отправьте код подключения из приложения NARIN WORK: /start <код>");
    return Response.json({ ok: true });
  }

  const code = match[1];
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: linked, error } = await supabase.rpc("link_telegram_account", {
    p_code: code,
    p_chat_id: chatId,
  });

  if (error || !linked) {
    await sendTelegramMessage(chatId, "Код не найден. Проверьте код в приложении и попробуйте снова.");
  } else {
    await sendTelegramMessage(chatId, "✅ Готово! Теперь уведомления NARIN WORK будут приходить сюда.");
  }

  return Response.json({ ok: true });
}
