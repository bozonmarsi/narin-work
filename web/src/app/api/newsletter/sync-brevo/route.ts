import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Отправляет в Brevo список подписчиков с персональными данными для рассылок —
// вместо ручного SQL → CSV → импорт (на этом шаге данные терялись, и письмо
// показывало "150 Kč za registraci" даже тем, у кого есть аккаунт и баллы).
//
// Для каждого newsletter_subscribers со status = 'subscribed':
//   NARIN_UCET       "ano", если есть аккаунт ("Tilda points"), иначе ""
//   NARIN_BODY_VETA  "Na účtu máte N b., to je N Kč na příští objednávku." или ""
//   NARIN_TOKEN      unsubscribe_token для vezminarin.cz/odhlaseni?token=…
// Все попадают в список Brevo LIST_NAME; отписавшиеся из него удаляются.
// Атрибуты, список и папка создаются сами, если их ещё нет.

const LIST_NAME = "NARIN – odběratelé";
const BREVO = "https://api.brevo.com/v3";

async function brevo(path: string, init?: RequestInit) {
  const res = await fetch(BREVO + path, {
    ...init,
    headers: { "Content-Type": "application/json", accept: "application/json", "api-key": process.env.BREVO_API_KEY!, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> | null };
}

async function selectAll<T>(supabase: SupabaseClient, table: string, columns: string) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function pointsSentence(balance: number) {
  const b = Math.floor(balance);
  return b > 0 ? `Na účtu máte ${b} b., to je ${b} Kč na příští objednávku.` : "";
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Не авторизован" }, { status: 401 });
  if (!process.env.BREVO_API_KEY) return Response.json({ error: "BREVO_API_KEY не настроен" }, { status: 500 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Не авторизован" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return Response.json({ error: "Недостаточно прав" }, { status: 403 });

  const { checkEmail } = (await request.json().catch(() => ({}))) as { checkEmail?: string };

  try {
    type Sub = { email: string; status: string; unsubscribe_token: string };
    type Pts = { email: string | null; balance: number | null };
    const subs = await selectAll<Sub>(supabase, "newsletter_subscribers", "email, status, unsubscribe_token");
    const pts = await selectAll<Pts>(supabase, "Tilda points", "email, balance");

    const balanceByEmail = new Map<string, number>();
    for (const p of pts) {
      const e = (p.email ?? "").trim().toLowerCase();
      if (!e) continue;
      balanceByEmail.set(e, Math.max(balanceByEmail.get(e) ?? 0, Number(p.balance) || 0));
    }

    const contacts = subs
      .filter((s) => s.status === "subscribed")
      .map((s) => {
        const email = s.email.trim().toLowerCase();
        const has = balanceByEmail.has(email);
        return {
          email,
          attributes: {
            NARIN_UCET: has ? "ano" : "",
            NARIN_BODY_VETA: has ? pointsSentence(balanceByEmail.get(email)!) : "",
            NARIN_TOKEN: s.unsubscribe_token,
          },
        };
      });
    const unsubscribed = subs.filter((s) => s.status !== "subscribed").map((s) => s.email.trim().toLowerCase());

    // 1) атрибуты (400 = уже есть — это нормально)
    for (const name of ["NARIN_UCET", "NARIN_BODY_VETA", "NARIN_TOKEN"]) {
      await brevo(`/contacts/attributes/normal/${name}`, { method: "POST", body: JSON.stringify({ type: "text" }) });
    }

    // 2) список (и папка для него)
    const lists = await brevo("/contacts/lists?limit=50&offset=0");
    let listId = ((lists.body?.lists as { id: number; name: string }[] | undefined) ?? []).find((l) => l.name === LIST_NAME)?.id;
    if (!listId) {
      const folders = await brevo("/contacts/folders?limit=10&offset=0");
      let folderId = ((folders.body?.folders as { id: number }[] | undefined) ?? [])[0]?.id;
      if (!folderId) {
        const f = await brevo("/contacts/folders", { method: "POST", body: JSON.stringify({ name: "NARIN" }) });
        folderId = f.body?.id as number;
      }
      const l = await brevo("/contacts/lists", { method: "POST", body: JSON.stringify({ name: LIST_NAME, folderId }) });
      if (!l.ok) throw new Error("Brevo: не удалось создать список — " + JSON.stringify(l.body));
      listId = l.body?.id as number;
    }

    // 3) импорт с обновлением существующих контактов
    const imp = await brevo("/contacts/import", {
      method: "POST",
      body: JSON.stringify({ jsonBody: contacts, listIds: [listId], updateExistingContacts: true, emptyContactsAttributes: true }),
    });
    if (!imp.ok) throw new Error("Brevo import: " + JSON.stringify(imp.body));

    // 4) отписавшиеся — убрать из списка (ошибки "нет в списке" не важны)
    for (let i = 0; i < unsubscribed.length; i += 150) {
      await brevo(`/contacts/lists/${listId}/contacts/remove`, { method: "POST", body: JSON.stringify({ emails: unsubscribed.slice(i, i + 150) }) });
    }

    const check = checkEmail
      ? contacts.find((c) => c.email === checkEmail.trim().toLowerCase()) ?? { email: checkEmail, notInList: true }
      : null;

    return Response.json({
      ok: true,
      listName: LIST_NAME,
      sent: contacts.length,
      withAccount: contacts.filter((c) => c.attributes.NARIN_UCET).length,
      withPoints: contacts.filter((c) => c.attributes.NARIN_BODY_VETA).length,
      removedUnsubscribed: unsubscribed.length,
      processId: imp.body?.processId ?? null,
      check,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
