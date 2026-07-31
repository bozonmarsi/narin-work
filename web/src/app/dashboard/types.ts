export type RawPayloadProduct = {
  name: string;
  price?: string;
  amount?: number;
  quantity?: number;
  unit?: string;
  portion?: string;
  image_url?: string;
};

export type RawPayload = {
  payment?: {
    products?: RawPayloadProduct[];
    subtotal?: string;
    amount?: string;
    delivery_price?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
} | null;

export type OrderRow = {
  id: string;
  raw_payload: RawPayload;
  order_id: string | null;
  customer_name: string | null;
  customer_last_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  address: string | null;
  city: string | null;
  psk: string | null;
  patro: string | null;
  company_name: string | null;
  cislo_bytu: string | null;
  kod_intercomu: string | null;
  delivery_date: string | null;
  delivery_slot: string | null;
  delivery_time_raw: string | null;
  delivery_type: string | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  recipient_lat: number | null;
  recipient_lng: number | null;
  products_text: string | null;
  goods_total: number | null;
  order_total: number | null;
  payment_method: string | null;
  payment_status: string | null;
  comments: string | null;
  manager_comment: string | null;
  florist_comment: string | null;
  status: string | null;
  assigned_courier_id: string | null;
  confirmed_at: string | null;
  cancelled_reason: string | null;
  problem_reported: boolean | null;
  problem_type: string | null;
  problem_comment: string | null;
  problem_photo_url: string | null;
  problem_reported_at: string | null;
  transfer_requested: boolean | null;
  transfer_reason: string | null;
  transfer_proposed_date: string | null;
  transfer_proposed_window_start: string | null;
  transfer_proposed_window_end: string | null;
  senders_name_postcard: string | null;
  recipients_name_postcard: string | null;
  postcard_comment: string | null;
  created_at: string | null;
  assigned_courier: { full_name: string | null } | null;
};

export type HistoryRow = {
  id: string;
  status: string;
  changed_at: string | null;
  note: string | null;
  changed_by_user: { full_name: string | null } | null;
};

export type CourierOption = {
  id: string;
  full_name: string | null;
};

export type ProductOption = {
  id: string;
  name: string;
  rawName: string;
  image_url: string | null;
};
