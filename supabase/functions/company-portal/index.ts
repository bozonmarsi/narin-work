// Firemni ucet (members/b2b) po tokenu.
//
// Drive stranka brala data funkcemi list_my_company_* s parametrem p_email, tedy bez dukazu, ze
// se pta vlastnik e-mailu. Ted vse jde pres lk_auth_token (HMAC, stejny jako member-data):
// e-mail se bere z overeneho tokenu, clenstvi ve firme se overuje zde a databaze se cte
// service klicem. Funkce NEPOUZIVA zadne z p_email RPC, ty se po nasazeni uzavrou (migrace
// 20261019070000), takze zadne volani "podle e-mailu" uz neni mozne.
//
// Akce:
//   companies                       -> firmy uzivatele
//   request                         -> posledni zadost o firemni ucet (pending/rejected)
//   overview  {company_id}          -> objednavky, faktury a pohyby na uctu jedne firmy
//   invoice   {invoice_id}          -> data pro PDF faktury (vola je serverova trasa NARIN WORK)
//
// verify_jwt: OFF (pokladna a kabinet volaji publishable klicem jako ostatni funkce).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};
const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  if (expected !== sigB64) return null;
  try {
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return String(payload.email || "").trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

// like-escape neni potreba: porovnavame lower(email) = email
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const email = await verifyToken(String(body.token || ""), Deno.env.get("AUTH_TOKEN_SECRET")!);
    if (!email) return json({ error: "invalid_token" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    async function isMember(companyId: string): Promise<boolean> {
      const { data } = await sb.from("company_members").select("id").eq("company_id", companyId).ilike("email", email!).maybeSingle();
      return !!data;
    }

    if (body.action === "companies") {
      const { data: members } = await sb
        .from("company_members")
        .select("company_id, role, full_name, phone")
        .ilike("email", email);
      const ids = (members ?? []).map((m) => m.company_id);
      if (!ids.length) return json({ companies: [] });
      const { data: companies } = await sb
        .from("companies")
        .select("id, name, ico, dic, is_vat_payer, billing_address, balance")
        .in("id", ids)
        .order("name");
      const byId = new Map((members ?? []).map((m) => [m.company_id, m]));
      return json({
        companies: (companies ?? []).map((c) => {
          const m = byId.get(c.id);
          return { ...c, role: m?.role ?? "member", member_full_name: m?.full_name ?? null, member_phone: m?.phone ?? null };
        }),
      });
    }

    if (body.action === "request") {
      const { data } = await sb
        .from("company_registration_requests")
        .select("id, status, ares_name, created_at, reviewed_at")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1);
      return json({ request: data && data[0] ? data[0] : null });
    }

    if (body.action === "overview") {
      const companyId = String(body.company_id || "");
      if (!companyId || !(await isMember(companyId))) return json({ error: "forbidden" }, 403);
      const [orders, invoices, tx] = await Promise.all([
        sb.from("tilda_orders")
          .select("order_id, created_at, delivery_date, order_total, status, products_text")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(300),
        sb.from("company_invoices")
          .select("id, invoice_number, period_start, period_end, total_amount, status, due_date, issued_at, paid_at")
          .eq("company_id", companyId)
          .not("status", "in", "(draft,cancelled)")
          .order("period_start", { ascending: false }),
        sb.from("company_balance_transactions")
          .select("id, amount, type, description, created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      return json({ orders: orders.data ?? [], invoices: invoices.data ?? [], tx: tx.data ?? [] });
    }

    if (body.action === "invoice") {
      const invoiceId = String(body.invoice_id || "");
      const { data: inv } = await sb
        .from("company_invoices")
        .select("id, company_id, invoice_number, period_start, period_end, total_amount, due_date, status, issued_at, paid_at")
        .eq("id", invoiceId)
        .maybeSingle();
      if (!inv || !(await isMember(inv.company_id))) return json({ error: "forbidden" }, 403);
      if (!inv.invoice_number || !inv.due_date || inv.status === "draft") return json({ error: "not_issued" }, 404);
      const { data: company } = await sb.from("companies").select("name, ico, dic, billing_address").eq("id", inv.company_id).maybeSingle();
      // delivery_date je casove razitko: bereme cely posledni den obdobi
      const end = new Date(`${inv.period_end}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const { data: rows } = await sb
        .from("tilda_orders")
        .select("order_id, delivery_date, order_total, used_points, raw_payload")
        .eq("company_id", inv.company_id)
        .eq("status", "delivered")
        .gte("delivery_date", inv.period_start)
        .lt("delivery_date", end.toISOString().slice(0, 10))
        .order("delivery_date");
      const orders = (rows ?? []).map((o) => {
        const p = (o.raw_payload as any)?.payment ?? {};
        return {
          order_id: o.order_id,
          delivery_date: String(o.delivery_date ?? "").slice(0, 10),
          order_total: o.order_total,
          // jen to, co patri na fakturu; zadna adresa ani jmeno prijemce
          payment: {
            products: p.products ?? null,
            subtotal: p.subtotal ?? null,
            delivery: p.delivery ?? null,
            delivery_price: p.delivery_price ?? null,
            amount: p.amount ?? null,
            promocode: p.promocode ?? (o.raw_payload as any)?.promocode ?? null,
            used_points: o.used_points ?? 0,
          },
        };
      });
      const { company_id: _c, ...invoice } = inv;
      return json({ invoice, company, orders });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
