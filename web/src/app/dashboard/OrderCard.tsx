"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OrderActions } from "./order-actions";
import { AssignCourier } from "./AssignCourier";
import { statusLabel, statusColor } from "@/lib/order-status";
import { formatDate, formatDateTime } from "@/lib/format";
import type { OrderRow, HistoryRow, CourierOption } from "./types";

export function OrderCard({
  order,
  couriers,
  onDone,
}: {
  order: OrderRow;
  couriers: CourierOption[];
  onDone: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && history === null) {
      setLoadingHistory(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("order_status_history")
        .select("id, status, changed_at, note, changed_by_user:users!changed_by(full_name)")
        .eq("order_id", order.id)
        .order("changed_at", { ascending: true });
      if (error) {
        console.error("history fetch error", error);
      }
      setHistory((data as unknown as HistoryRow[]) ?? []);
      setLoadingHistory(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button type="button" onClick={toggleExpand} className="flex-1 space-y-1 text-left text-sm">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            #{order.order_id} · {order.customer_name} → {order.recipient_name}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(order.status)}`}>
              {statusLabel(order.status)}
            </span>
            {order.problem_reported && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Проблема
              </span>
            )}
            {order.transfer_requested && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                Запрос переноса
              </span>
            )}
          </p>
          <p className="text-zinc-600">
            {order.address}, {order.city}
          </p>
          <p className="text-zinc-600">
            {formatDate(order.delivery_date)}
            {order.delivery_slot ? ` · ${order.delivery_slot}` : ""}
          </p>
          <p className="text-zinc-600">{order.products_text}</p>
          <p className="text-zinc-600">
            {order.order_total} Kč · {order.payment_method} · {order.payment_status}
          </p>
          {order.assigned_courier?.full_name && (
            <p className="text-zinc-600">Курьер: {order.assigned_courier.full_name}</p>
          )}
        </button>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {order.status === "new" && <OrderActions orderId={order.id} onDone={onDone} />}
          {order.status === "confirmed" && !order.assigned_courier_id && (
            <AssignCourier orderId={order.id} couriers={couriers} onDone={onDone} />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4 text-sm">
          <p>
            <span className="font-medium">Телефон заказчика: </span>
            {order.customer_phone ?? "—"}
          </p>
          <p>
            <span className="font-medium">Телефон получателя: </span>
            {order.recipient_phone ?? "—"}
          </p>
          {order.comments && (
            <p>
              <span className="font-medium">Комментарий клиента: </span>
              {order.comments}
            </p>
          )}
          {order.cancelled_reason && (
            <p>
              <span className="font-medium">Причина отмены: </span>
              {order.cancelled_reason}
            </p>
          )}

          {order.problem_reported && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="font-medium text-red-700">Проблема: {order.problem_type ?? "не указан тип"}</p>
              {order.problem_comment && <p className="text-red-700">{order.problem_comment}</p>}
            </div>
          )}

          {order.transfer_requested && (
            <div className="rounded-md bg-orange-50 p-3">
              <p className="font-medium text-orange-700">Запрос переноса</p>
              {order.transfer_reason && <p className="text-orange-700">Причина: {order.transfer_reason}</p>}
              {order.transfer_proposed_date && (
                <p className="text-orange-700">Предложенная дата: {order.transfer_proposed_date}</p>
              )}
            </div>
          )}

          <div>
            <p className="mb-1 font-medium">История статусов</p>
            {loadingHistory && <p className="text-zinc-500">Загрузка…</p>}
            {history && history.length === 0 && <p className="text-zinc-500">Пока пусто</p>}
            <ul className="space-y-1">
              {history?.map((h) => (
                <li key={h.id} className="text-zinc-600">
                  {formatDateTime(h.changed_at)} — {statusLabel(h.status)}
                  {h.changed_by_user?.full_name ? ` · ${h.changed_by_user.full_name}` : ""}
                  {h.note ? ` · ${h.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
