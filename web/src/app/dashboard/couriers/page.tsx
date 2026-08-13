"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { todayUTC, startOfWeek, toDateKey } from "@/lib/schedule";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type CourierRow = { id: string; full_name: string | null; base_rate: number; rate_per_km: number };
type DeliveredOrder = { assigned_courier_id: string | null; delivery_date: string | null; delivery_price: number | null };

export default function CouriersPage() {
  const { profile } = useDashboard();
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [rateEdits, setRateEdits] = useState<Record<string, { base_rate: string; rate_per_km: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<DeliveredOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // No setLoading(true) — see the same note in CourierView.tsx.
    const supabase = createClient();

    const [couriersRes, deliveredRes] = await Promise.all([
      supabase.from("users").select("id, full_name, base_rate, rate_per_km").eq("role", "courier"),
      supabase
        .from("tilda_orders")
        .select("assigned_courier_id, delivery_date, delivery_price")
        .eq("status", "delivered")
        .not("assigned_courier_id", "is", null),
    ]);

    if (couriersRes.error || deliveredRes.error) {
      setError(couriersRes.error?.message ?? deliveredRes.error?.message ?? "Ошибка загрузки");
    } else {
      setError(null);
      const list = couriersRes.data ?? [];
      setCouriers(list);
      // Only seed rateEdits for couriers we haven't seen yet — a background
      // refresh (Realtime) must never clobber whatever the manager is
      // mid-typing in these fields before they hit Save.
      setRateEdits((prev) => {
        const next = { ...prev };
        for (const c of list) {
          if (!(c.id in next)) {
            next[c.id] = { base_rate: String(c.base_rate), rate_per_km: String(c.rate_per_km) };
          }
        }
        return next;
      });
      setDelivered(deliveredRes.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh("tilda_orders", () => {
    if (profile?.role === "manager") load();
  });

  async function saveRate(courierId: string) {
    setSavingId(courierId);
    const edit = rateEdits[courierId];
    const supabase = createClient();
    await supabase
      .from("users")
      .update({ base_rate: Number(edit.base_rate) || 0, rate_per_km: Number(edit.rate_per_km) || 0 })
      .eq("id", courierId);
    setSavingId(null);
    setSavedId(courierId);
    setTimeout(() => setSavedId(null), 1500);
  }

  if (profile?.role !== "manager") return null;
  if (loading) return <p className="text-zinc-500 dark:text-zinc-400">Загрузка…</p>;

  const todayKey = toDateKey(todayUTC());
  const weekStartKey = toDateKey(startOfWeek(todayUTC()));

  function statsFor(courierId: string) {
    const own = delivered.filter((o) => o.assigned_courier_id === courierId);
    const today = own.filter((o) => o.delivery_date?.slice(0, 10) === todayKey);
    const week = own.filter((o) => (o.delivery_date?.slice(0, 10) ?? "") >= weekStartKey);
    const sum = (list: DeliveredOrder[]) => list.reduce((s, o) => s + (o.delivery_price ?? 0), 0);
    return { todayCount: today.length, todaySum: sum(today), weekCount: week.length, weekSum: sum(week) };
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Курьеры</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Статистика считает только реально доставленные заказы (статус &laquo;Доставлено&raquo;) — заказы в пути или в сборке
        сюда не попадают.
      </p>

      {error && <p className="text-red-600 dark:text-red-400">Ошибка: {error}</p>}

      {couriers.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">Курьеров пока нет.</p>
      ) : (
        <div className="space-y-3">
          {couriers.map((c) => {
            const s = statsFor(c.id);
            const edit = rateEdits[c.id] ?? { base_rate: "50", rate_per_km: "9" };
            return (
              <div key={c.id} className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{c.full_name ?? c.id}</p>
                  <div className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-300">
                    <span>
                      Сегодня: <span className="font-medium">{s.todayCount}</span> ·{" "}
                      <span className="font-medium">{s.todaySum.toFixed(0)} Kč</span>
                    </span>
                    <span>
                      Неделя: <span className="font-medium">{s.weekCount}</span> ·{" "}
                      <span className="font-medium">{s.weekSum.toFixed(0)} Kč</span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">База за доставку (Kč)</span>
                    <input
                      type="number"
                      value={edit.base_rate}
                      onChange={(e) =>
                        setRateEdits((r) => ({ ...r, [c.id]: { ...edit, base_rate: e.target.value } }))
                      }
                      className="w-28 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">За км (Kč)</span>
                    <input
                      type="number"
                      value={edit.rate_per_km}
                      onChange={(e) =>
                        setRateEdits((r) => ({ ...r, [c.id]: { ...edit, rate_per_km: e.target.value } }))
                      }
                      className="w-28 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <button
                    onClick={() => saveRate(c.id)}
                    disabled={savingId === c.id}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {savingId === c.id ? "Сохраняем…" : savedId === c.id ? "Сохранено ✓" : "Сохранить"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
