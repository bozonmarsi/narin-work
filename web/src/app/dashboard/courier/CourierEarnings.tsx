"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { formatDate } from "@/lib/format";
import { todayUTC, startOfWeek, toDateKey } from "@/lib/schedule";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type DeliveredOrder = {
  id: string;
  order_id: string | null;
  recipient_name: string | null;
  delivery_date: string | null;
  distance_km: number | null;
  delivery_price: number | null;
};

export function CourierEarnings() {
  const { user } = useDashboard();
  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // No setLoading(true) — see the same note in CourierView.tsx.
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tilda_orders")
      .select("id, order_id, recipient_name, delivery_date, distance_km, delivery_price")
      .eq("assigned_courier_id", user.id)
      .eq("status", "delivered")
      .order("delivery_date", { ascending: false })
      .limit(200);

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setOrders(data ?? []);
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh("tilda_orders", load);

  if (loading) return <p className="text-sm text-zinc-500">Загрузка…</p>;
  if (error) return <p className="text-sm text-red-600">Ошибка: {error}</p>;

  const todayKey = toDateKey(todayUTC());
  const weekStartKey = toDateKey(startOfWeek(todayUTC()));

  const sum = (list: DeliveredOrder[]) => list.reduce((s, o) => s + (o.delivery_price ?? 0), 0);
  const todayOrders = orders.filter((o) => o.delivery_date?.slice(0, 10) === todayKey);
  const weekOrders = orders.filter((o) => (o.delivery_date?.slice(0, 10) ?? "") >= weekStartKey);

  const byDay = new Map<string, DeliveredOrder[]>();
  for (const o of orders) {
    const key = o.delivery_date?.slice(0, 10) ?? "—";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(o);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs text-zinc-500">Сегодня</p>
          <p className="text-lg font-semibold">{sum(todayOrders).toFixed(0)} Kč</p>
          <p className="text-xs text-zinc-400">{todayOrders.length} доставок</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs text-zinc-500">За неделю</p>
          <p className="text-lg font-semibold">{sum(weekOrders).toFixed(0)} Kč</p>
          <p className="text-xs text-zinc-400">{weekOrders.length} доставок</p>
        </div>
      </div>

      {orders.length === 0 && <p className="text-sm text-zinc-500">Пока нет доставленных заказов.</p>}

      <div className="space-y-3">
        {[...byDay.entries()].map(([day, list]) => (
          <div key={day} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
              <span>{formatDate(list[0].delivery_date)}</span>
              <span>{sum(list).toFixed(0)} Kč</span>
            </div>
            <div className="space-y-1">
              {list.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs"
                >
                  <span>
                    #{o.order_id} · {o.recipient_name}
                    {o.distance_km != null && <span className="text-zinc-400"> · {o.distance_km.toFixed(1)} км</span>}
                  </span>
                  <span className="font-medium text-accent">
                    {o.delivery_price != null ? `${o.delivery_price.toFixed(0)} Kč` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
