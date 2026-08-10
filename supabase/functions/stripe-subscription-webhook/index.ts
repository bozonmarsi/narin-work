// Narin flower shop — Stripe webhook for "Předplatné".
// Deploy: supabase functions deploy stripe-subscription-webhook --no-verify-jwt
// (Stripe calls this directly, not through the Tilda page, so it can't send
// our anon key — the endpoint must skip Supabase's own JWT check and rely on
// the Stripe signature instead.)
// Secrets needed: STRIPE_SECRET_KEY (same one already used by the existing
// order webhook — same Stripe account, safe to reuse, do not overwrite it),
// STRIPE_SUBSCRIPTION_WEBHOOK_SECRET — a NEW, separate secret from the
// existing STRIPE_WEBHOOK_SECRET, because that name is already claimed by
// the order-payments webhook endpoint and has its own signing secret; this
// function needs its own endpoint in Stripe with its own signing secret.
// Events to enable on the Stripe side: checkout.session.completed,
// customer.subscription.deleted.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

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

const cryptoProvider = Stripe.createSubtleCryptoProvider();
// TESTING: pointed at the test-mode endpoint's signing secret — switch back
// to STRIPE_SUBSCRIPTION_WEBHOOK_SECRET (live) before real customers use this.
const webhookSecret = Deno.env.get("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET_TEST")!;

const CYCLE_DAYS = 28;

function addDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}
function toKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function loadClosedCalendar() {
  const [{ data: weekly }, { data: dates }] = await Promise.all([
    supabase.from("shop_weekly_closed_days").select("weekday"),
    supabase.from("shop_closed_dates").select("closed_date"),
  ]);
  return {
    closedWeekdays: new Set((weekly ?? []).map((r: { weekday: number }) => r.weekday)),
    closedDates: new Set((dates ?? []).map((r: { closed_date: string }) => r.closed_date)),
  };
}

function isClosed(date: Date, closedWeekdays: Set<number>, closedDates: Set<string>) {
  return closedWeekdays.has(date.getUTCDay()) || closedDates.has(toKey(date));
}

function shiftForward(date: Date, closedWeekdays: Set<number>, closedDates: Set<string>) {
  let d = date;
  while (isClosed(d, closedWeekdays, closedDates)) d = addDays(d, 1);
  return d;
}

function shiftBackward(date: Date, closedWeekdays: Set<number>, closedDates: Set<string>) {
  let d = date;
  while (isClosed(d, closedWeekdays, closedDates)) d = addDays(d, -1);
  return d;
}

// Spreads `count` deliveries evenly across a 28-day cycle from anchorDateStr,
// nudging any date that lands on a closed day forward to the next open day —
// or backward if that forward nudge would collide with the next delivery.
function generateOccurrenceDates(
  anchorDateStr: string,
  count: number,
  closedWeekdays: Set<number>,
  closedDates: Set<string>,
) {
  const anchor = new Date(anchorDateStr + "T00:00:00Z");
  const raw: Date[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.round((i * CYCLE_DAYS) / count);
    raw.push(addDays(anchor, offset));
  }

  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    let candidate = shiftForward(raw[i], closedWeekdays, closedDates);
    const nextRaw = i < count - 1 ? raw[i + 1] : null;
    if (nextRaw && candidate.getTime() >= nextRaw.getTime()) {
      candidate = shiftBackward(raw[i], closedWeekdays, closedDates);
    }
    result.push(toKey(candidate));
  }
  return result;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const m = session.metadata ?? {};

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", session.subscription as string)
    .maybeSingle();
  if (existing) return; // webhook retry — already processed

  const { data: inserted, error } = await supabase
    .from("subscriptions")
    .insert({
      email: m.email,
      line_id: m.line_id || null,
      line_name_snapshot: m.line_name,
      size: m.size,
      price_per_delivery_snapshot: Number(m.price_per_delivery),
      deliveries_per_cycle: Number(m.deliveries_per_cycle),
      discount_percent_snapshot: Number(m.discount_percent),
      cycle_price_snapshot: Number(m.cycle_price),
      mood_note: m.mood_note || null,
      exclusions_note: m.exclusions_note || null,
      recipient_name: m.recipient_name,
      recipient_phone: m.recipient_phone,
      address: m.address,
      city: m.city || null,
      psk: m.psk || null,
      patro: m.patro || null,
      company_name: m.company_name || null,
      cislo_bytu: m.cislo_bytu || null,
      kod_intercomu: m.kod_intercomu || null,
      cycle_anchor_date: m.cycle_anchor_date,
      status: "active",
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("failed to insert subscription", error);
    return;
  }

  const { closedWeekdays, closedDates } = await loadClosedCalendar();
  const dates = generateOccurrenceDates(
    m.cycle_anchor_date,
    Number(m.deliveries_per_cycle),
    closedWeekdays,
    closedDates,
  );

  const occurrences = dates.map((d) => ({
    subscription_id: inserted.id,
    occurrence_date: d,
    status: "planned",
  }));
  const { error: occErr } = await supabase.from("subscription_occurrences").insert(occurrences);
  if (occErr) console.error("failed to insert occurrences", occErr);
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        await handleCheckoutCompleted(session);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("stripe_subscription_id", sub.id);
    }
  } catch (err) {
    console.error(err);
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
