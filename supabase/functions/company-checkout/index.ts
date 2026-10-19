// Firma z pokladny: ARES overeni na serveru + bezpecne zalozeni firmy v uctu.
//
// Pravidla (dohodnuta 2026-10-19):
//  - Firmu zaklada jen PRIHLASENY zakaznik (lk_auth_token = overeny e-mail) a jen kdyz
//    takove ICO v tabulce companies jeste neni. Zakladatel se stane adminem firmy.
//  - Existuje-li ICO uz, zakaznik se NIKDY nepripise sam. Vznikne zadost
//    (company_registration_requests, status pending), o pristupu rozhodne manazer
//    na strance "Business". Objednavka jde s fakturacnimi udaji i bez toho.
//  - Udaje o firme se berou z ARES na serveru, nikdy z prohlizece.
//
// verify_jwt: OFF (pokladna vola s publishable klicem jako ostatni funkce).
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

function icoValid(v: string): boolean {
  if (!/^\d{8}$/.test(v)) return false;
  const w = [8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(v[i]) * w[i];
  return (11 - (sum % 11)) % 10 === Number(v[7]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action !== "claim") return json({ error: "unknown_action" }, 400);

    const email = await verifyToken(String(body.token || ""), Deno.env.get("AUTH_TOKEN_SECRET")!);
    if (!email) return json({ error: "invalid_token" }, 401);

    const ico = String(body.ico || "").replace(/\s+/g, "");
    if (!icoValid(ico)) return json({ state: "invalid_ico" });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existing } = await sb.from("companies").select("id").eq("ico", ico).limit(1);
    const company = existing && existing[0];

    if (company) {
      const { data: member } = await sb
        .from("company_members")
        .select("id")
        .eq("company_id", company.id)
        .ilike("email", email)
        .maybeSingle();
      if (member) return json({ state: "member", company_id: company.id });

      const { data: pending } = await sb
        .from("company_registration_requests")
        .select("id")
        .ilike("email", email)
        .eq("ico", ico)
        .eq("status", "pending")
        .maybeSingle();
      if (pending) return json({ state: "pending" });

      const fullName = String(body.full_name || "").trim().slice(0, 120);
      const phone = String(body.phone || "").trim().slice(0, 40);
      if (!fullName || !phone) return json({ state: "exists" });
      const ares = await fetchAres(ico);
      if (!ares) return json({ state: "exists" });
      const { error } = await sb.from("company_registration_requests").insert({
        email, ico, full_name: fullName, phone,
        ares_name: ares.name, ares_address: ares.address, ares_dic: ares.dic, ares_is_vat_payer: ares.vat,
        status: "pending",
      });
      if (error) return json({ state: "exists" });
      return json({ state: "pending" });
    }

    const ares = await fetchAres(ico);
    if (!ares) return json({ state: "not_found" });

    const { data: created, error: cErr } = await sb
      .from("companies")
      .insert({
        name: ares.name,
        ico,
        dic: ares.dic,
        is_vat_payer: ares.vat,
        billing_address: ares.address,
        contact_name: String(body.full_name || "").trim().slice(0, 120) || null,
        contact_email: email,
        contact_phone: String(body.phone || "").trim().slice(0, 40) || null,
        notes: "Vytvořeno automaticky z pokladny (bez schválení manažera)",
      })
      .select("id")
      .single();
    if (cErr || !created) return json({ state: "error" });

    const { error: mErr } = await sb.from("company_members").insert({ company_id: created.id, email, role: "admin" });
    if (mErr) return json({ state: "error" });
    return json({ state: "created", company_id: created.id });
  } catch (e) {
    return json({ state: "error", message: String(e) });
  }
});

async function fetchAres(ico: string): Promise<{ name: string; address: string; dic: string | null; vat: boolean } | null> {
  try {
    const r = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.obchodniJmeno) return null;
    return {
      name: String(j.obchodniJmeno),
      address: String(j.sidlo?.textovaAdresa || ""),
      dic: j.dic ? String(j.dic) : null,
      vat: j.seznamRegistraci?.stavZdrojeDph === "AKTIVNI",
    };
  } catch {
    return null;
  }
}
