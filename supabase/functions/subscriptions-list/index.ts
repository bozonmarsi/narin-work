// Narin flower shop — lightweight "list my subscriptions" lookup.
// Split out of the main `subscriptions` function on purpose: that function
// imports the Stripe SDK at module load time, which adds real cold-start
// latency, but "list" never touches Stripe — it's a pure Supabase read.
// Deploy: supabase functions deploy subscriptions-list

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Identita klienta = HMAC-token (lk_auth_token z auth-verify), stejně jako
// member-data / personal-dates. E-mail z těla požadavku se už nebere:
// dřív šlo poslat cizí e-mail a číst/rušit cizí předplatné.
const encoder = new TextEncoder();
async function emailFromToken(token: unknown): Promise<string | null> {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const key = await crypto.subtle.importKey("raw", encoder.encode(Deno.env.get("AUTH_TOKEN_SECRET")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  if (btoa(String.fromCharCode(...new Uint8Array(sigBuf))) !== sigB64) return null;
  try {
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.exp || payload.exp < Date.now() || !payload.email) return null;
    return String(payload.email).trim().toLowerCase();
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const email = await emailFromToken(body.token);
    if (!email) return json({ error: "invalid_token" }, 401);

    const { data: subs, error: subErr } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("email", email)
      .order("created_at", { ascending: false });
    if (subErr) return json({ error: subErr.message }, 500);

    const ids = (subs ?? []).map((s) => s.id);
    let occurrences: Record<string, unknown>[] = [];
    if (ids.length > 0) {
      const { data: occs, error: occErr } = await supabase
        .from("subscription_occurrences")
        .select("id, subscription_id, occurrence_date, status, preview_photo_url, order_id, recipient_name, recipient_phone, address, city, psk, tilda_orders(status)")
        .in("subscription_id", ids)
        .order("occurrence_date");
      if (occErr) return json({ error: occErr.message }, 500);
      // Flatten the embedded order status — "delivered" here is the only
      // thing that should ever render as a completed (green) delivery on
      // the client; occurrence.status just tracks whether an order exists
      // yet, not whether it actually arrived.
      occurrences = (occs ?? []).map((o) => {
        const order = o.tilda_orders as { status: string | null } | null;
        const { tilda_orders, ...rest } = o;
        return { ...rest, order_status: order?.status ?? null };
      });
    }

    const result = (subs ?? []).map((s) => ({
      ...s,
      occurrences: occurrences.filter((o) => o.subscription_id === s.id),
    }));

    return json({ subscriptions: result });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
