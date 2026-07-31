export type CourierOrder = {
  id: string;
  order_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  address: string | null;
  city: string | null;
  delivery_date: string | null;
  delivery_slot: string | null;
  delivery_time_raw: string | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  recipient_lat: number | null;
  recipient_lng: number | null;
  products_text: string | null;
  comments: string | null;
  manager_comment: string | null;
  florist_comment: string | null;
  status: string | null;
  assigned_courier_id: string | null;
  problem_reported: boolean | null;
  transfer_requested: boolean | null;
  route_sequence: number | null;
};

export const COURIER_ORDER_COLUMNS =
  "id, order_id, recipient_name, recipient_phone, address, city, delivery_date, delivery_slot, delivery_time_raw, delivery_window_start, delivery_window_end, recipient_lat, recipient_lng, products_text, comments, manager_comment, florist_comment, status, assigned_courier_id, problem_reported, transfer_requested, route_sequence";

export type RouteStop = {
  orderId: string;
  sequence: number;
  etaMinutesFromStart: number;
  legDistanceMeters: number;
  legDurationSeconds: number;
  missedDeadline: boolean;
  notBeforeMinutes: number | null;
  notAfterMinutes: number | null;
};

export type RoutePlanResponse = {
  stops: RouteStop[];
  unplaced: string[]; // order IDs missing coordinates — couldn't be routed
  totalDurationSeconds: number;
  totalDistanceMeters: number;
};
