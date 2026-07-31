// Server-only — reads TELEGRAM_BOT_TOKEN (no NEXT_PUBLIC_ prefix), never
// reaches the browser bundle.

export async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("Telegram sendMessage failed", data);
  }
  return data;
}
