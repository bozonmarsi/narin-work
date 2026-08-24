// Narin flower shop \u2014 "P\u0159edplatn\u00e9" edge function.
// Single function, action-based, same pattern as personal-dates / customer-deposit.
// Deploy: supabase functions deploy subscriptions
// Requires the STRIPE_SECRET_KEY secret set (Supabase dashboard \u2192 Edge Functions \u2192 Secrets),
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

// TESTING: pointed at the test-mode key for now \u2014 switch back to
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
    if (action === "list") {
      return await listSubscriptions(body);
    }
    if (action === "billing-info") {
      return await billingInfo(body);
    }
    if (action === "update-occurrence") {
      return await updateOccurrence(body);
    }
    if (action === "cancel") {
      return await cancelSubscription(body);
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
    vase_exchange: body.vase_exchange ? "true" : "false",
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
            name: `${line.name} \u00b7 ${size} \u00b7 ${count}x/m\u011bs\u00edc`,
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

async function listSubscriptions(body: Record<string, unknown>) {
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
      .select("id, subscription_id, occurrence_date, status, preview_photo_url")
      .in("subscription_id", ids)
      .order("occurrence_date");
    if (occErr) return json({ error: occErr.message }, 500);
    occurrences = occs ?? [];
  }

  const result = (subs ?? []).map((s) => ({
    ...s,
    occurrences: occurrences.filter((o) => o.subscription_id === s.id),
  }));

  return json({ subscriptions: result });
}

async function loadOwnedSubscription(email: string, subscriptionId: string) {
  const { data: sub } = await supabase.from("subscriptions").select("*").eq("id", subscriptionId).maybeSingle();
  if (!sub || sub.email !== email) return null;
  return sub;
}

async function billingInfo(body: Record<string, unknown>) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const subscriptionId = String(body.subscription_id ?? "");
  const sub = await loadOwnedSubscription(email, subscriptionId);
  if (!sub) return json({ error: "not found" }, 404);

  if (!sub.stripe_subscription_id) {
    return json({ next_payment_date: null, next_payment_amount: null, portal_url: null });
  }

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: String(body.return_url ?? ""),
  });

  return json({
    next_payment_date: new Date(stripeSub.current_period_end * 1000).toISOString().slice(0, 10),
    next_payment_amount: sub.cycle_price_snapshot,
    portal_url: portalSession.url,
  });
}

const RESCHEDULE_CUTOFF_HOURS = 48;

async function updateOccurrence(body: Record<string, unknown>) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const occurrenceId = String(body.occurrence_id ?? "");

  const { data: occ } = await supabase.from("subscription_occurrences").select("*").eq("id", occurrenceId).maybeSingle();
  if (!occ) return json({ error: "not found" }, 404);
  const sub = await loadOwnedSubscription(email, occ.subscription_id);
  if (!sub) return json({ error: "not found" }, 404);

  const payload: Record<string, unknown> = {};
  for (const f of ["recipient_name", "recipient_phone", "address", "city", "psk"]) {
    if (f in body) payload[f] = String(body[f] ?? "").trim() || null;
  }

  const cutoffMs = RESCHEDULE_CUTOFF_HOURS * 60 * 60 * 1000;
  const now = Date.now();

  if ("occurrence_date" in body) {
    const newDate = String(body.occurrence_date ?? "");
    const currentDateMs = new Date(occ.occurrence_date + "T00:00:00Z").getTime();
    if (currentDateMs - now < cutoffMs) {
      return json({ error: "too_late", message: `Tuto dod\u00e1vku u\u017e nelze p\u0159esunout \u2014 do doru\u010den\u00ed zb\u00fdv\u00e1 m\u00e9n\u011b ne\u017e ${RESCHEDULE_CUTOFF_HOURS} hodin.` }, 400);
    }
    const targetDateMs = new Date(newDate + "T00:00:00Z").getTime();
    if (!newDate || Number.isNaN(targetDateMs) || targetDateMs - now < cutoffMs) {
      return json({ error: "invalid_date", message: `Nov\u00e9 datum mus\u00ed b\u00fdt alespo\u0148 ${RESCHEDULE_CUTOFF_HOURS} hodin dop\u0159edu.` }, 400);
    }
    payload.occurrence_date = newDate;
  }

  const { data, error } = await supabase.from("subscription_occurrences").update(payload).eq("id", occurrenceId).select("*").single();
  if (error) return json({ error: error.message }, 500);

  // Keep an already-generated order (visible to warehouse/courier) in sync.
  if (occ.order_id) {
    const orderPayload: Record<string, unknown> = { route_sequence: null };
    if ("occurrence_date" in payload) orderPayload.delivery_date = payload.occurrence_date;
    if ("recipient_name" in payload) orderPayload.recipient_name = payload.recipient_name ?? sub.recipient_name;
    if ("recipient_phone" in payload) orderPayload.recipient_phone = payload.recipient_phone ?? sub.recipient_phone;
    if ("address" in payload) orderPayload.address = payload.address ?? sub.address;
    if ("city" in payload) orderPayload.city = payload.city ?? sub.city;
    if ("psk" in payload) orderPayload.psk = payload.psk ?? sub.psk;
    await supabase.from("tilda_orders").update(orderPayload).eq("id", occ.order_id);
  }

  return json({ occurrence: data });
}

async function cancelSubscription(body: Record<string, unknown>) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const subscriptionId = String(body.subscription_id ?? "");
  const sub = await loadOwnedSubscription(email, subscriptionId);
  if (!sub) return json({ error: "not found" }, 404);
  if (sub.status !== "active") return json({ error: "already cancelled" }, 400);

  if (sub.stripe_subscription_id) {
    await stripe.subscriptions.cancel(sub.stripe_subscription_id);
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", subscriptionId);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
}
