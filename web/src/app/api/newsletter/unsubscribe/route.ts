import { createClient } from "@supabase/supabase-js";

// Вызывается со страницы vezminarin.cz/odhlaseni сразу после отписки.
// Сама отписка — RPC unsubscribe_newsletter (источник правды у нас в базе),
// а здесь то же самое переносится в Brevo мгновенно: контакт получает
// emailBlacklisted, и ни одна следующая кампания ему уже не уйдёт, даже если
// перед ней забыли нажать «Отправить в Brevo». Транзакционные письма
// (заказ, доставка) это не блокирует.
//
// Токен проверяет сама база (RPC идемпотентна: для уже отписанного вернёт тот
// же email), так что чужой e-mail сюда не подсунуть.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { headers: CORS });
}

export async function POST(request: Request) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return Response.json({ ok: false, error: "bad_token" }, { status: 400, headers: CORS });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await supabase.rpc("unsubscribe_newsletter", { p_token: token });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.ok || !row.email) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404, headers: CORS });
  }

  if (!process.env.BREVO_API_KEY) {
    return Response.json({ ok: true, brevo: "not_configured" }, { headers: CORS });
  }
  const email = String(row.email).trim().toLowerCase();
  const res = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY },
    body: JSON.stringify({ emailBlacklisted: true }),
  });
  // 404 = такого контакта в Brevo ещё нет — ему и так ничего не уйдёт
  return Response.json({ ok: true, brevo: res.ok ? "blacklisted" : res.status === 404 ? "not_in_brevo" : "error" }, { headers: CORS });
}
