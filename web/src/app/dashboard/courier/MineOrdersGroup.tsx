"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { CourierOrderCard } from "./CourierOrderCard";
import type { CourierOrder, RoutePlanResponse } from "./types";

// Route-building only ever makes sense within a single (date, slot) group —
// stops from a different slot aren't part of the same drive, so each group
// gets its own independent route computation rather than one shared button
// that would silently mix unrelated stops into one nonsense "route".
//
// The chosen order is persisted to each order's `route_sequence` column, not
// just kept in local state — otherwise it reset back to whatever order
// Supabase happened to return every time ANY order in the group changed
// status (a re-fetch elsewhere in the app), which looked like the route
// "forgetting itself" mid-slot.
export function MineOrdersGroup({
  date,
  slot,
  orders,
  userId,
  onDone,
}: {
  date: string | null;
  slot: string | null;
  orders: CourierOrder[];
  userId: string;
  onDone: () => void;
}) {
  const [route, setRoute] = useState<RoutePlanResponse | null>(null);
  const [buildingRoute, setBuildingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  async function buildRoute() {
    setBuildingRoute(true);
    setRouteError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setRouteError("Не авторизован");
      setBuildingRoute(false);
      return;
    }

    const res = await fetch("/api/courier/plan-route", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ orderIds: orders.map((o) => o.id), slot }),
    });
    const data = (await res.json()) as RoutePlanResponse & { error?: string };

    if (!res.ok) {
      setRouteError(data.error ?? "Ошибка построения маршрута");
      setBuildingRoute(false);
      return;
    }

    // Persist the sequence so it survives reloads and status changes on
    // other orders — reading it back is what makes the route "stick".
    await Promise.all(
      data.stops.map((s) => supabase.from("tilda_orders").update({ route_sequence: s.sequence }).eq("id", s.orderId)),
    );
    // Unplaced stops (no coordinates) never had a sequence — leave as null.

    setRoute(data);
    setBuildingRoute(false);
    onDone();
  }

  const richByOrderId = new Map(route?.stops.map((s) => [s.orderId, s]) ?? []);
  const sorted = [...orders].sort((a, b) => {
    const sa = a.route_sequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.route_sequence ?? Number.MAX_SAFE_INTEGER;
    return sa - sb;
  });

  const hasAnySequence = orders.some((o) => o.route_sequence != null);
  const allHaveSequence = orders.every((o) => o.route_sequence != null);
  const routeIncomplete = hasAnySequence && !allHaveSequence;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          {formatDate(date)}
          {slot ? ` · ${slot}` : ""}
        </p>
        {orders.length > 1 && (
          <button
            onClick={buildRoute}
            disabled={buildingRoute}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {buildingRoute ? "Считаем…" : hasAnySequence ? "🧭 Пересчитать маршрут" : "🧭 Построить маршрут"}
          </button>
        )}
      </div>

      {routeError && <p className="text-xs text-red-600 dark:text-red-400">{routeError}</p>}

      {routeIncomplete && !buildingRoute && (
        <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
          В маршруте появились изменения (новый заказ или правки менеджера) — нажмите &laquo;Пересчитать маршрут&raquo;.
        </p>
      )}

      {route && (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          ~{Math.round(route.totalDurationSeconds / 60)} мин, {(route.totalDistanceMeters / 1000).toFixed(1)} км
          {route.unplaced.length > 0 && (
            <span className="ml-2 text-orange-600 dark:text-orange-400">{route.unplaced.length} без координат — не в маршруте</span>
          )}
          {route.stops.some((s) => s.missedDeadline) && (
            <span className="ml-2 font-medium text-red-600 dark:text-red-400">
              ⚠️ есть конфликт пожеланий по времени — один курьер не успевает ко всем сразу
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((o) => (
          <CourierOrderCard
            key={o.id}
            order={o}
            mode="mine"
            userId={userId}
            onDone={onDone}
            sequence={o.route_sequence}
            routeStop={richByOrderId.get(o.id)}
          />
        ))}
      </div>
    </div>
  );
}
