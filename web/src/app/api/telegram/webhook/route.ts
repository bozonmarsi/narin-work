import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram";

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
