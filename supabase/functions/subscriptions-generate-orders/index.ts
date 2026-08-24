// Narin flower shop \u2014 safety-net job for "P\u0159edplatn\u00e9".
// The primary path now generates every order for a cycle immediately, right
// when its dates are created (in the Stripe webhook and in the manager
// cabinet) \u2014 this function no longer carries the normal-case load. It just
// catches anything that fell through (a transient error during the primary
// insert, a subscription created some other way) by finding any planned
// occurrence that still has no linked order, regardless of how far away its
// date is, and generating it. Runs daily via pg_cron \u2014 see the migration.
// Deploy: supabase functions deploy subscriptions-generate-orders --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SIZE_LABELS: Record<string, string> = { small: "S", medium: "M", large: "L" };

Deno.serve(async () => {
  const { data: due, error: dueErr } = await supabase
    .from("subscription_occurrences")
    .select("*, subscriptions(*)")
    .eq("status", "planned")
    .is("order_id", null);

  if (dueErr) {
    console.error(dueErr);
    return new Response(JSON.stringify({ error: dueErr.message }), { status: 500 });
  }

  let created = 0;
  const errors: string[] = [];

  for (const occ of due ?? []) {
    const sub = occ.subscriptions;
    if (!sub || sub.status !== "active") continue;

    const { data: newOrder, error: orderErr } = await supabase
      .from("tilda_orders")
      .insert({
        order_id: `PREDPL-${sub.id.slice(0, 8)}-${occ.occurrence_date}`,
        customer_email: sub.email,
        recipient_name: occ.recipient_name ?? sub.recipient_name,
        recipient_phone: occ.recipient_phone ?? sub.recipient_phone,
        address: occ.address ?? sub.address,
        city: occ.city ?? sub.city,
        psk: occ.psk ?? sub.psk,
        patro: occ.patro ?? sub.patro,
        company_name: occ.company_name ?? sub.company_name,
        cislo_bytu: occ.cislo_bytu ?? sub.cislo_bytu,
        kod_intercomu: occ.kod_intercomu ?? sub.kod_intercomu,
        delivery_date: occ.occurrence_date,
        delivery_type: "Doru\u010den\u00ed kur\u00fdrem (p\u0159edplatn\u00e9)",
        products_text: `${sub.line_name_snapshot} \u00b7 ${SIZE_LABELS[sub.size] ?? sub.size} (p\u0159edplatn\u00e9)`,
        goods_total: sub.price_per_delivery_snapshot,
        order_total: sub.price_per_delivery_snapshot,
        payment_status: "\ud83d\udfe2 \u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e",
        raw_payload: {
          payment: {
            products: [
              {
                name: `${sub.line_name_snapshot} \u00b7 ${SIZE_LABELS[sub.size] ?? sub.size} (p\u0159edplatn\u00e9)`,
                price: String(sub.price_per_delivery_snapshot),
                quantity: 1,
              },
            ],
            subtotal: String(sub.price_per_delivery_snapshot),
            amount: String(sub.price_per_delivery_snapshot),
          },
        },
        manager_comment: "Vygenerov\u00e1no automaticky z p\u0159edplatn\u00e9ho, ji\u017e uhrazeno v r\u00e1mci cyklu.",
        subscription_id: sub.id,
        status: "new",
      })
      .select("id")
      .single();

    if (orderErr || !newOrder) {
      errors.push(`${occ.id}: ${orderErr?.message}`);
      continue;
    }

    await supabase.from("subscription_occurrences").update({ order_id: newOrder.id, status: "generated" }).eq("id", occ.id);
    await supabase.from("subscription_history").insert({
      subscription_id: sub.id,
      note: `Automaticky vytvo\u0159ena objedn\u00e1vka pro term\u00edn ${occ.occurrence_date}`,
    });
    created++;
  }

  return new Response(JSON.stringify({ created, errors }), { headers: { "Content-Type": "application/json" } });
});
