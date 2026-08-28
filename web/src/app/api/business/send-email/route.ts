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

  const { to, subject, html, attachmentBase64, attachmentName } = (await request.json()) as {
    to?: string;
    subject?: string;
    html?: string;
    attachmentBase64?: string;
    attachmentName?: string;
  };

  if (!to || !subject || !html) {
    return Response.json({ error: "Не хватает полей (to/subject/html)" }, { status: 400 });
  }

  const ok = await sendBrevoEmail(
    to,
    subject,
    html,
    attachmentBase64 && attachmentName ? [{ content: attachmentBase64, name: attachmentName }] : undefined,
  );

  return Response.json({ ok });
}
