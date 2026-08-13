"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { statusLabel, statusColor } from "@/lib/order-status";
import { formatDate } from "@/lib/format";
import type { CourierOrder, RouteStop } from "./types";

const PROBLEM_TYPES = [
  { value: "not_home", label: "Не застал" },
  { value: "wrong_address", label: "Неверный адрес" },
  { value: "refused", label: "Отказался принимать" },
  { value: "warehouse_issue", label: "Проблема со сборкой" },
  { value: "other", label: "Другое" },
];

function ActionButton({
  onClick,
  disabled,
  className,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-2 py-1 text-[11px] font-medium leading-tight disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function CourierOrderCard({
  order,
  mode,
  userId,
  onDone,
  sequence,
  routeStop,
}: {
  order: CourierOrder;
  mode: "pool" | "mine";
  userId: string;
  onDone: () => void;
  // Persisted position in the route (survives reloads) — always available
  // once a route was ever built for this order, even across page refreshes.
  sequence?: number | null;
  // Rich per-leg detail (ETA, distance, deadline conflicts) — only present
  // for the session that actually just computed the route; a full page
  // reload loses this part (by design, not worth persisting), but keeps
  // `sequence` so the order itself doesn't reshuffle.
  routeStop?: RouteStop;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<"problem" | "transfer" | null>(null);
  const [problemType, setProblemType] = useState("not_home");
  const [problemComment, setProblemComment] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferDate, setTransferDate] = useState("");

  async function updateOrder(patch: Record<string, unknown>, historyNote: string, newStatus?: string) {
    setPending(true);
    setError(null);
    const supabase = createClient();

    const { error: updateError } = await supabase.from("tilda_orders").update(patch).eq("id", order.id);
    if (updateError) {
      setError(updateError.message);
      setPending(false);
      return;
    }

    await supabase.from("order_status_history").insert({
      order_id: order.id,
      status: newStatus ?? order.status ?? "confirmed",
      changed_by: userId,
      note: historyNote,
    });

    setPending(false);
    onDone();
  }

  function claim() {
    updateOrder(
      { assigned_courier_id: userId, status: "courier_assigned" },
      "Курьер взял заказ из пула",
      "courier_assigned",
    );
  }

  function setStatus(status: string, note: string) {
    updateOrder({ status }, note, status);
  }

  async function markDelivered() {
    setPending(true);
    setError(null);
    const supabase = createClient();

    let distanceKm = routeStop ? routeStop.legDistanceMeters / 1000 : null;
    if (distanceKm == null) {
      // No route was ever built for this order (e.g. courier had just one
      // stop) — fall back to a direct warehouse-to-address estimate so pay
      // still gets recorded, using the same distance-calc endpoint.
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch("/api/courier/plan-route", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ orderIds: [order.id], slot: order.delivery_slot }),
          });
          const data = await res.json();
          if (res.ok && data.stops?.[0]) {
            distanceKm = data.stops[0].legDistanceMeters / 1000;
          }
        }
      } catch {
        // Best-effort — if this fails, we still record the delivery, just
        // without a distance/payout figure attached.
      }
    }

    const { data: rates } = await supabase.from("users").select("base_rate, rate_per_km").eq("id", userId).single();

    const price = rates && distanceKm != null ? rates.base_rate + distanceKm * rates.rate_per_km : null;

    updateOrder(
      { status: "delivered", distance_km: distanceKm, delivery_price: price },
      "Курьер: доставлено",
      "delivered",
    );
  }

  function submitProblem() {
    updateOrder(
      {
        status: "problem",
        problem_reported: true,
        problem_type: problemType,
        problem_comment: problemComment || null,
        problem_reported_at: new Date().toISOString(),
        problem_reported_by: userId,
      },
      `Проблема (${PROBLEM_TYPES.find((p) => p.value === problemType)?.label}): ${problemComment || "без комментария"}`,
      "problem",
    );
    setOpenForm(null);
    setProblemComment("");
  }

  function submitTransfer() {
    updateOrder(
      {
        status: "transfer_pending",
        transfer_requested: true,
        transfer_reason: transferReason || null,
        transfer_proposed_date: transferDate || null,
      },
      `Запрос переноса на ${transferDate || "не указано"}: ${transferReason || "без причины"}`,
      "transfer_pending",
    );
    setOpenForm(null);
    setTransferReason("");
    setTransferDate("");
  }

  const mapsUrl = order.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.address}, ${order.city ?? ""}`)}`
    : null;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        {sequence != null && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
            {sequence}
          </span>
        )}
        <span className="font-medium">#{order.order_id}</span>
        <span className="text-zinc-700 dark:text-zinc-200">{order.recipient_name}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusColor(order.status)}`}>
          {statusLabel(order.status)}
        </span>
      </div>

      <p className="mt-0.5 truncate text-zinc-500 dark:text-zinc-400">
        {order.address}, {order.city} · {formatDate(order.delivery_date)}
        {order.delivery_slot ? ` · ${order.delivery_slot}` : ""}
        {order.delivery_time_raw ? ` · ${order.delivery_time_raw}` : ""}
      </p>

      {routeStop && (
        <p className={routeStop.missedDeadline ? "font-medium text-red-600 dark:text-red-400" : "text-accent"}>
          →{" "}{Math.round(routeStop.legDurationSeconds / 60)} мин · прибытие ~{routeStop.etaMinutesFromStart}{" "}
          мин от начала слота
          {routeStop.missedDeadline && " · ⚠️ не успеваем к пожеланию по времени"}
        </p>
      )}
      {(order.delivery_window_start || order.delivery_window_end) && (
        <p className="font-medium text-orange-700 dark:text-orange-400">
          ⏰{" "}
          {order.delivery_window_start && `не раньше ${order.delivery_window_start.slice(11, 16)}`}
          {order.delivery_window_start && order.delivery_window_end && " · "}
          {order.delivery_window_end && `успеть до ${order.delivery_window_end.slice(11, 16)}`}
        </p>
      )}

      <p className="truncate text-zinc-500 dark:text-zinc-400">{order.products_text}</p>

      {order.comments && (
        <p className="truncate text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">Клиент:</span> {order.comments}
        </p>
      )}
      {order.manager_comment && (
        <p className="truncate text-blue-700 dark:text-blue-400">
          <span className="font-medium">Менеджер:</span> {order.manager_comment}
        </p>
      )}
      {order.florist_comment && (
        <p className="truncate text-purple-700 dark:text-purple-400">
          <span className="font-medium">Флорист:</span> {order.florist_comment}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1">
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            title="Маршрут в картах"
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            🗺️
          </a>
        )}
        {order.recipient_phone && (
          <a
            href={`tel:${order.recipient_phone.replace(/[^\d+]/g, "")}`}
            title="Позвонить получателю"
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            📞
          </a>
        )}

        {mode === "pool" && (
          <ActionButton onClick={claim} disabled={pending} title="Взять заказ в работу" className="bg-accent text-white hover:bg-accent-hover">
            ✅ Взять
          </ActionButton>
        )}

        {mode === "mine" && (
          <>
            {(order.status === "courier_assigned" || order.status === "assembling" || order.status === "assembled") && (
              <ActionButton
                onClick={() => setStatus("in_transit", "Курьер выехал")}
                disabled={pending}
                title="Отметить: выехал к получателю"
                className="bg-accent text-white hover:bg-accent-hover"
              >
                🚗 Выехал
              </ActionButton>
            )}
            {(order.status === "in_transit" || order.status === "arriving") && (
              <>
                {order.status === "in_transit" && (
                  <ActionButton
                    onClick={() => setStatus("arriving", "Курьер подъезжает")}
                    disabled={pending}
                    title="Отметить: подъезжаю (~10 минут)"
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    ⏱ Подъезжаю
                  </ActionButton>
                )}
                <ActionButton
                  onClick={markDelivered}
                  disabled={pending}
                  title="Отметить: доставлено"
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  ✅ Готово
                </ActionButton>
              </>
            )}
            <ActionButton
              onClick={() => setOpenForm(openForm === "problem" ? null : "problem")}
              disabled={pending}
              title="Сообщить о проблеме"
              className="border border-red-300 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              ⚠️ Проблема
            </ActionButton>
            <ActionButton
              onClick={() => setOpenForm(openForm === "transfer" ? null : "transfer")}
              disabled={pending}
              title="Запросить перенос доставки"
              className="border border-orange-300 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10"
            >
              📅 Перенос
            </ActionButton>
          </>
        )}
      </div>

      {openForm === "problem" && (
        <div className="mt-1.5 space-y-1.5 rounded-md bg-red-50 dark:bg-red-500/10 p-2">
          <select
            value={problemType}
            onChange={(e) => setProblemType(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs"
          >
            {PROBLEM_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <textarea
            value={problemComment}
            onChange={(e) => setProblemComment(e.target.value)}
            placeholder="Комментарий для менеджера"
            rows={2}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs"
          />
          <button
            onClick={submitProblem}
            disabled={pending}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Отправить
          </button>
        </div>
      )}

      {openForm === "transfer" && (
        <div className="mt-1.5 space-y-1.5 rounded-md bg-orange-50 dark:bg-orange-500/10 p-2">
          <input
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs"
          />
          <textarea
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
            placeholder="Причина переноса"
            rows={2}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs"
          />
          <button
            onClick={submitTransfer}
            disabled={pending}
            className="rounded-md bg-orange-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Отправить запрос
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
