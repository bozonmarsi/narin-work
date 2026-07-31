import { sendTelegramMessage } from "@/lib/telegram";

// Called by a Postgres trigger (via pg_net) whenever something notification-
// worthy happens on an order — the trigger already decided who and what, this
// route just has to actually deliver it. Authenticated with a shared secret
// (TELEGRAM_WEBHOOK_SECRET) that only our own DB and this deployment know —
// not the real bot token, so exposure here is low-stakes even if it ever
// leaked.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.TELEGRAM_WEBHOOK_SECRET}`;
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || authHeader !== expected) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { chat_id, text } = (await request.json()) as { chat_id: number; text: string };
  if (!chat_id || !text) {
    return Response.json({ error: "chat_id и text обязательны" }, { status: 400 });
  }

  await sendTelegramMessage(chat_id, text);
  return Response.json({ ok: true });
}
