import { createClient } from "@supabase/supabase-js";
import { sendBrevoEmail } from "@/lib/brevo";

// Вызывается напрямую из браузера страницей "Бизнес" — нужен реальный
// пропуск по сессии менеджера (не общий секрет, как у tilda-webhook),
// поэтому проверяем access token через тот же Supabase, что и RLS.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") {
    return Response.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { to, subject, html, attachments } = (await request.json()) as {
    to?: string;
    subject?: string;
    html?: string;
    attachments?: { content: string; name: string }[];
  };

  if (!to || !subject || !html) {
    return Response.json({ error: "Не хватает полей (to/subject/html)" }, { status: 400 });
  }

  // Brevo сама режет письмо целиком, если вложения слишком тяжёлые —
  // проверяем сами, чтобы дать понятную ошибку, а не молчаливый отказ.
  const totalBytes = (attachments ?? []).reduce((sum, a) => sum + a.content.length * 0.75, 0);
  if (totalBytes > 15 * 1024 * 1024) {
    return Response.json({ error: "Вложения слишком большие (лимит ~15 МБ суммарно)" }, { status: 400 });
  }

  const ok = await sendBrevoEmail(to, subject, html, attachments && attachments.length ? attachments : undefined);

  return Response.json({ ok });
}
