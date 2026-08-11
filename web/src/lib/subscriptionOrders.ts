import type { SupabaseClient } from "@supabase/supabase-js";

const SIZE_LABELS: Record<string, string> = { small: "S", medium: "M", large: "L" };

type SubscriptionForOrder = {
  id: string;
  email: string;
  line_name_snapshot: string;
  size: string;
  price_per_delivery_snapshot: number;
  recipient_name: string;
  recipient_phone: string;
  address: string;
  city: string | null;
  psk: string | null;
  patro: string | null;
  company_name: string | null;
  cislo_bytu: string | null;
  kod_intercomu: string | null;
};

type OccurrenceForOrder = {
  id: string;
  occurrence_date: string;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  address?: string | null;
  city?: string | null;
  psk?: string | null;
  patro?: string | null;
  company_name?: string | null;
  cislo_bytu?: string | null;
  kod_intercomu?: string | null;
};

// Creates the real tilda_orders row for one subscription delivery and marks
// the occurrence as generated. Mirrors the same logic in the Deno webhook
// and the cron safety-net function — kept in sync by hand since each runs
// in a different runtime.
export async function generateOrderForOccurrence(
  supabase: SupabaseClient,
  sub: SubscriptionForOrder,
  occ: OccurrenceForOrder,
): Promise<string | null> {
  const label = `${sub.line_name_snapshot} · ${SIZE_LABELS[sub.size] ?? sub.size} (předplatné)`;

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
      delivery_type: "Doručení kurýrem (předplatné)",
      products_text: label,
      goods_total: sub.price_per_delivery_snapshot,
      order_total: sub.price_per_delivery_snapshot,
      payment_status: "🟢 Оплачено",
      raw_payload: {
        payment: {
          products: [{ name: label, price: String(sub.price_per_delivery_snapshot), quantity: 1 }],
          subtotal: String(sub.price_per_delivery_snapshot),
          amount: String(sub.price_per_delivery_snapshot),
        },
      },
      manager_comment: "Vygenerováno automaticky z předplatného, již uhrazeno v rámci cyklu.",
      subscription_id: sub.id,
      status: "new",
    })
    .select("id")
    .single();

  if (orderErr || !newOrder) {
    console.error("failed to create order for occurrence", occ.id, orderErr);
    return null;
  }

  await supabase.from("subscription_occurrences").update({ order_id: newOrder.id, status: "generated" }).eq("id", occ.id);
  return newOrder.id as string;
}
