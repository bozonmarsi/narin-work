export type SubscriptionSize = "small" | "medium" | "large";
export type SubscriptionStatus = "active" | "cancelled";
export type OccurrenceStatus = "planned" | "generated" | "skipped";

export const SIZE_LABELS: Record<SubscriptionSize, string> = { small: "S", medium: "M", large: "L" };

export type Category = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};

export type Line = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
};

export type Plan = {
  id: string;
  line_id: string;
  size: SubscriptionSize;
  price_per_delivery: number;
  active: boolean;
};

export type Tier = {
  deliveries_per_cycle: number;
  discount_percent: number;
  perk_text: string | null;
  active: boolean;
};

export type Subscription = {
  id: string;
  email: string;
  line_id: string | null;
  line_name_snapshot: string;
  size: SubscriptionSize;
  price_per_delivery_snapshot: number;
  deliveries_per_cycle: number;
  discount_percent_snapshot: number;
  cycle_price_snapshot: number;
  mood_note: string | null;
  exclusions_note: string | null;
  vase_exchange: boolean;
  recipient_name: string;
  recipient_phone: string;
  address: string;
  city: string | null;
  psk: string | null;
  patro: string | null;
  company_name: string | null;
  cislo_bytu: string | null;
  kod_intercomu: string | null;
  cycle_anchor_date: string;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  cancelled_at: string | null;
};

export type Occurrence = {
  id: string;
  subscription_id: string;
  occurrence_date: string;
  status: OccurrenceStatus;
  recipient_name: string | null;
  recipient_phone: string | null;
  address: string | null;
  city: string | null;
  psk: string | null;
  patro: string | null;
  company_name: string | null;
  cislo_bytu: string | null;
  kod_intercomu: string | null;
  preview_photo_url: string | null;
  preview_uploaded_at: string | null;
  order_id: string | null;
  created_at: string;
};

export type SubHistoryRow = {
  id: string;
  note: string;
  changed_at: string | null;
  changed_by_user: { full_name: string | null } | null;
};

export const RECIPIENT_FIELDS = [
  "recipient_name",
  "recipient_phone",
  "address",
  "city",
  "psk",
  "patro",
  "company_name",
  "cislo_bytu",
  "kod_intercomu",
] as const;
