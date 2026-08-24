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
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "missing email" }, 400);

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
        .select("id, subscription_id, occurrence_date, status, preview_photo_url, order_id, tilda_orders(status)")
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
