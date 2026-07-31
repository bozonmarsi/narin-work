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
  new: "bg-zinc-100 text-zinc-700",
  confirmed: "bg-blue-50 text-blue-700",
  courier_assigned: "bg-blue-50 text-blue-700",
  assembling: "bg-amber-50 text-amber-700",
  assembled: "bg-amber-50 text-amber-700",
  in_transit: "bg-indigo-50 text-indigo-700",
  arriving: "bg-indigo-50 text-indigo-700",
  delivered: "bg-green-50 text-green-700",
  not_home: "bg-orange-50 text-orange-700",
  problem: "bg-red-50 text-red-700",
  transfer_pending: "bg-orange-50 text-orange-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

export function statusLabel(status: string | null) {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

export function statusColor(status: string | null) {
  if (!status) return "bg-zinc-100 text-zinc-700";
  return STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-700";
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
