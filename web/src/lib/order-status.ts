export const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  courier_assigned: "Назначен курьер",
  assembling: "Сборка",
  assembled: "Собран",
  in_transit: "В пути",
  arriving: "Подъезжает",
  delivered: "Доставлен",
  not_home: "Не застал",
  problem: "Проблема",
  transfer_pending: "Ожидает переноса",
  cancelled: "Отменён",
};

export const STATUS_COLORS: Record<string, string> = {
  new: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200",
  confirmed: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  courier_assigned: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  assembling: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  assembled: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  in_transit: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  arriving: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  delivered: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400",
  not_home: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400",
  problem: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",
  transfer_pending: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400",
  cancelled: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
};

export function statusLabel(status: string | null) {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

export function statusColor(status: string | null) {
  if (!status) return "bg-zinc-100 text-zinc-700";
  return STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-700";
}

// Courier-delivery orders always mention "kurýrem" in this field (Tilda's
// "Doručení kurýrem + servisní poplatek = 239"); self-pickup only has
// "Servisní poplatek = 80" — no courier involved at all, so the whole
// courier_assigned/in_transit/arriving part of the workflow doesn't apply.
export function isPickupOrder(deliveryType: string | null) {
  return !(deliveryType ?? "").toLowerCase().includes("kurýrem");
}

export const IN_PROGRESS_STATUSES = [
  "confirmed",
  "courier_assigned",
  "assembling",
  "assembled",
  "in_transit",
  "arriving",
];

export const COMPLETED_STATUSES = ["delivered", "cancelled", "not_home"];

// Columns shown on the Kanban board — active work only, delivered/cancelled
// live in the calendar view and the "completed" history instead.
export const KANBAN_STATUSES = [
  "new",
  "confirmed",
  "courier_assigned",
  "assembling",
  "assembled",
  "in_transit",
  "arriving",
];

// Every status a manager can manually set on an order, in workflow order.
export const ALL_STATUSES = [
  "new",
  "confirmed",
  "courier_assigned",
  "assembling",
  "assembled",
  "in_transit",
  "arriving",
  "delivered",
  "not_home",
  "problem",
  "transfer_pending",
  "cancelled",
];
