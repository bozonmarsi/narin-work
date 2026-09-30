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

// Stripe přesměrování jen zpět na náš web (jinak by šlo podstrčit cizí adresu)
const SITE = "https://vezminarin.cz/";
function safeUrl(u: unknown, fallback: string) {
  const s = String(u ?? "");
  return s.startsWith(SITE) ? s : fallback;
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
    const action = body.action;

    // Akce z manažerské aplikace: přihlášení manažera (Supabase session), ne token klienta
    if (action === "manager-cancel" || action === "manager-sync-price") {
      if (!(await isManager(req))) return json({ error: "forbidden" }, 403);
      return action === "manager-cancel" ? await managerCancel(body) : await managerSyncPrice(body);
    }

    const email = await emailFromToken(body.token);
    if (!email) return json({ error: "invalid_token" }, 401);
    body.email = email;

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
  const successUrl = safeUrl(body.success_url, SITE + "members/subscription?status=success");
  const cancelUrl = safeUrl(body.cancel_url, SITE + "members/subscription?status=cancelled");

  if (!email || !lineId || !size || !count || !cycleAnchorDate || !recipientName || !recipientPhone || !address || !successUrl || !cancelUrl) {
    return json({ error: "missing required fields" }, 400);
  }

  const anchorMs = new Date(cycleAnchorDate + "T00:00:00Z").getTime();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleAnchorDate) || Number.isNaN(anchorMs) || anchorMs < Date.now() - 24 * 3600 * 1000) {
    return json({ error: "invalid_date", message: "Datum první dodávky musí být v budoucnosti." }, 400);
  }

  const { data: line, error: lineErr } = await supabase
    .from("subscription_lines")
    .select("id, name")
    .eq("id", lineId)
    .eq("active", true)
    .maybeSingle();
  if (lineErr || !line) return json({ error: "unknown line" }, 400);

  const { data: lineCat } = await supabase.from("subscription_lines").select("category_id, subscription_categories(active)").eq("id", lineId).maybeSingle();
  const cat = lineCat?.subscription_categories as { active: boolean } | null | undefined;
  if (cat && cat.active === false) return json({ error: "unknown line" }, 400);
  if (await isClosedDay(cycleAnchorDate)) {
    return json({ error: "closed_day", message: "V tento den nevozíme, vyberte prosím jiné datum první dodávky." }, 400);
  }

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
    vase_exchange: body.vase_exchange && (await vaseAllowed(count)) ? "true" : "false",
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
    return_url: safeUrl(body.return_url, SITE + "members/subscription"),
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
  if (new Date(occ.occurrence_date + "T23:59:59Z").getTime() < Date.now()) {
    return json({ error: "past", message: "Tato dodávka už proběhla, nelze ji upravit." }, 400);
  }

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
    if (await isClosedDay(newDate)) {
      return json({ error: "closed_day", message: "V tento den nevozíme, vyberte prosím jiné datum." }, 400);
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

async function isClosedDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const [{ data: weekly }, { data: closed }] = await Promise.all([
    supabase.from("shop_weekly_closed_days").select("weekday").eq("weekday", d.getUTCDay()),
    supabase.from("shop_closed_dates").select("closed_date").eq("closed_date", dateStr),
  ]);
  return (weekly?.length ?? 0) > 0 || (closed?.length ?? 0) > 0;
}

async function vaseAllowed(count: number) {
  const { data } = await supabase.from("subscription_settings").select("vase_enabled, vase_min_deliveries").eq("id", 1).maybeSingle();
  if (!data) return count >= 4; // tabulka nastavení ještě neexistuje → původní pravidlo
  return data.vase_enabled && count >= data.vase_min_deliveries;
}

// ---------- manažer ----------
async function isManager(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data } = await supabase.auth.getUser(jwt);
  if (!data?.user) return false;
  const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).maybeSingle();
  return profile?.role === "manager";
}

// Zrušení z aplikace: dřív se změnil jen stav u nás a Stripe dál strhával peníze.
async function managerCancel(body: Record<string, unknown>) {
  const subscriptionId = String(body.subscription_id ?? "");
  const { data: sub } = await supabase.from("subscriptions").select("*").eq("id", subscriptionId).maybeSingle();
  if (!sub) return json({ error: "not found" }, 404);
  if (sub.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      // už zrušené ve Stripe = v pořádku, jinak chybu vrátíme a nic neměníme
      const code = (err as { code?: string }).code;
      if (code !== "resource_missing") return json({ error: "stripe", message: String(err) }, 502);
    }
  }
  await supabase.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", subscriptionId);
  return json({ ok: true });
}

// Změna linie/velikosti/počtu v aplikaci → nová cena i ve Stripe (od příští platby, bez doplatků).
async function managerSyncPrice(body: Record<string, unknown>) {
  const subscriptionId = String(body.subscription_id ?? "");
  const { data: sub } = await supabase.from("subscriptions").select("*").eq("id", subscriptionId).maybeSingle();
  if (!sub) return json({ error: "not found" }, 404);
  if (!sub.stripe_subscription_id || sub.status !== "active") return json({ ok: true, skipped: true });

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const item = stripeSub.items.data[0];
  if (!item) return json({ error: "no_item" }, 400);
  const amount = Math.round(Number(sub.cycle_price_snapshot) * 100);
  if (item.price.unit_amount === amount) return json({ ok: true, unchanged: true });

  const productId = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
  await stripe.products.update(productId, {
    name: `${sub.line_name_snapshot} \u00b7 ${sub.size} \u00b7 ${sub.deliveries_per_cycle}x/m\u011bs\u00edc`,
  });
  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    items: [{
      id: item.id,
      price_data: { currency: "czk", product: productId, unit_amount: amount, recurring: { interval: "week", interval_count: 4 } },
    }],
    proration_behavior: "none",
  });
  return json({ ok: true, amount: sub.cycle_price_snapshot });
}
