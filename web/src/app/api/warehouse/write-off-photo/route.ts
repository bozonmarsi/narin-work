import { createClient } from "@supabase/supabase-js";
import { sendTelegramPhoto } from "@/lib/telegram";

// Списание не грузит фото в Supabase Storage — оно уходит менеджерам прямо
// в Telegram (via sendPhoto), а обратно клиенту возвращается только
// file_id, чтобы сохранить его на строке write_offs для истории.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const formData = await request.formData();
  const photo = formData.get("photo");
  const caption = String(formData.get("caption") ?? "");
  if (!(photo instanceof Blob) || !caption) {
    return Response.json({ error: "photo и caption обязательны" }, { status: 400 });
  }

  // Скоуплено токеном звонящего — get_manager_telegram_chat_ids сама
  // проверяет is_manager()/is_warehouse(), поэтому service-role тут не нужен.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: chatRows, error } = await supabase.rpc("get_manager_telegram_chat_ids");
  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  let telegramFileId: string | null = null;
  for (const row of (chatRows ?? []) as { chat_id: number }[]) {
    const result = await sendTelegramPhoto(row.chat_id, photo, "write-off.jpg", caption);
    const sizes = result?.result?.photo;
    if (sizes?.length) {
      telegramFileId = sizes[sizes.length - 1].file_id;
    }
  }

  return Response.json({ telegramFileId });
}
