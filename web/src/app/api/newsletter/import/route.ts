import { createClient } from "@supabase/supabase-js";

// Массовый импорт email в newsletter_subscribers — используется для
// подгрузки лидов с формы "Chci vědět první" на заглушке (эти submissions
// живут только в самой Tilda, не у нас, менеджер их экспортирует и
// вставляет сюда вручную) и для любого будущего разового импорта списка.
// Та же проверка роли через сессию менеджера, что и у /api/business/send-email.
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

  const { emails, source } = (await request.json()) as { emails?: string[]; source?: string };
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return Response.json({ error: "Список email пуст" }, { status: 400 });
  }
  if (emails.length > 5000) {
    return Response.json({ error: "Слишком много адресов за раз (лимит 5000)" }, { status: 400 });
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const cleaned = Array.from(
    new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => emailRe.test(e)),
    ),
  );
  if (cleaned.length === 0) {
    return Response.json({ error: "Ни один адрес не прошёл проверку формата" }, { status: 400 });
  }

  const { data: insertedCount, error } = await supabase.rpc("import_newsletter_emails", {
    p_emails: cleaned,
    p_source: source || "signup_form",
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    submitted: emails.length,
    validEmails: cleaned.length,
    inserted: insertedCount ?? 0,
    skippedExisting: cleaned.length - (insertedCount ?? 0),
  });
}
