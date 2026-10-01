// Server-only — reads TELEGRAM_BOT_TOKEN (no NEXT_PUBLIC_ prefix), never
// reaches the browser bundle.

export type TelegramMessageOptions = {
  parse_mode?: "HTML";
  reply_markup?: unknown; // inline_keyboard (tlačítka u zprávy)
};

export async function sendTelegramMessage(chatId: number, text: string, options: TelegramMessageOptions = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...options }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("Telegram sendMessage failed", data);
  }
  return data;
}

// Odpověď na klepnutí na tlačítko u zprávy (jinak se v Telegramu točí "hodiny").
export async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) console.error(`Telegram ${method} failed`, data);
  return data;
}

// Списание шлёт фото сюда вместо Supabase Storage — экономит место, а
// найти карточку потом можно и так: file_id остаётся рабочим в Bot API
// сколько угодно, отдельно скачивать и хранить сам файл не нужно.
export async function sendTelegramPhoto(chatId: number, photo: Blob, filename: string, caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("photo", photo, filename);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("Telegram sendPhoto failed", data);
  }
  return data;
}
