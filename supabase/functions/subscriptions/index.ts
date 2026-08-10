// Narin flower shop — "Předplatné" edge function.
// Single function, action-based, same pattern as personal-dates / customer-deposit.
// Deploy: supabase functions deploy subscriptions
// Requires the STRIPE_SECRET_KEY secret set (Supabase dashboard → Edge Functions → Secrets),
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// TESTING: pointed at the test-mode key for now — switch back to
// STRIPE_SECRET_KEY (live) before real customers use this.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY_TEST")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

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
    const action = body.action;

    if (action === "create-checkout") {
      return await createCheckout(body);
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

async function createCheckout(body: Record<string, unknown>) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const lineId = String(body.line_id ?? "");
  const size = String(body.size ?? "");
  const count = Number(body.count ?? 0);
  const cycleAnchorDate = String(body.cycle_anchor_date ?? "");
  const recipientName = String(body.recipient_name ?? "").trim();
  const recipientPhone = String(body.recipient_phone ?? "").trim();
  const address = String(body.address ?? "").trim();
  const successUrl = String(body.success_url ?? "");
  const cancelUrl = String(body.cancel_url ?? "");

  if (!email || !lineId || !size || !count || !cycleAnchorDate || !recipientName || !recipientPhone || !address || !successUrl || !cancelUrl) {
    return json({ error: "missing required fields" }, 400);
  }

  const { data: line, error: lineErr } = await supabase
    .from("subscription_lines")
    .select("id, name")
    .eq("id", lineId)
    .eq("active", true)
    .maybeSingle();
  if (lineErr || !line) return json({ error: "unknown line" }, 400);

  const { data: plan, error: planErr } = await supabase
    .from("subscription_plans")
    .select("price_per_delivery")
    .eq("line_id", lineId)
    .eq("size", size)
    .eq("active", true)
    .maybeSingle();
  if (planErr || !plan) return json({ error: "unknown plan" }, 400);

  const { data: tier, error: tierErr } = await supabase
    .from("subscription_frequency_tiers")
    .select("discount_percent, perk_text")
    .eq("deliveries_per_cycle", count)
    .eq("active", true)
    .maybeSingle();
  if (tierErr || !tier) return json({ error: "unknown frequency tier" }, 400);

  const pricePerDelivery = Number(plan.price_per_delivery);
  const discountPercent = Number(tier.discount_percent);
  const cyclePrice = Math.round(pricePerDelivery * count * (1 - discountPercent / 100));

  const existing = await stripe.customers.list({ email, limit: 1 });
  const customer = existing.data[0] ?? (await stripe.customers.create({ email }));

  const metadata: Record<string, string> = {
    email,
    line_id: lineId,
    line_name: line.name,
    size,
    price_per_delivery: String(pricePerDelivery),
    deliveries_per_cycle: String(count),
    discount_percent: String(discountPercent),
    cycle_price: String(cyclePrice),
    cycle_anchor_date: cycleAnchorDate,
    mood_note: String(body.mood_note ?? ""),
    exclusions_note: String(body.exclusions_note ?? ""),
    recipient_name: recipientName,
    recipient_phone: recipientPhone,
    address,
    city: String(body.city ?? ""),
    psk: String(body.psk ?? ""),
    patro: String(body.patro ?? ""),
    company_name: String(body.company_name ?? ""),
    cislo_bytu: String(body.cislo_bytu ?? ""),
    kod_intercomu: String(body.kod_intercomu ?? ""),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [
      {
        price_data: {
          currency: "czk",
          unit_amount: Math.round(cyclePrice * 100),
          recurring: { interval: "week", interval_count: 4 },
          product_data: {
            name: `${line.name} · ${size} · ${count}x/měsíc`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    subscription_data: { metadata },
  });

  return json({ url: session.url, cycle_price: cyclePrice, discount_percent: discountPercent, perk_text: tier.perk_text });
}
