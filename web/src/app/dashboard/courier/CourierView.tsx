"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { CourierOrderCard } from "./CourierOrderCard";
import { MineOrdersGroup } from "./MineOrdersGroup";
import { CourierEarnings } from "./CourierEarnings";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { COURIER_ORDER_COLUMNS } from "./types";
import type { CourierOrder } from "./types";

const MINE_STATUSES = ["courier_assigned", "assembling", "assembled", "in_transit", "arriving"];

function groupKey(o: CourierOrder) {
  return `${o.delivery_date ?? "—"}|${o.delivery_slot ?? "—"}`;
}

export function CourierView() {
  const { user } = useDashboard();
  const [tab, setTab] = useState<"mine" | "pool" | "earnings">("mine");
  const [pool, setPool] = useState<CourierOrder[]>([]);
  const [mine, setMine] = useState<CourierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // No setLoading(true) here on purpose — this also runs on every
    // background Realtime refresh, and flipping back to the full-screen
    // "Загрузка…" state on every such update would make the list flash
    // blank each time something changes anywhere in the app. The initial
    // `true` from useState covers the first paint; after that we just swap
    // data in quietly.
    const supabase = createClient();

    const [poolRes, mineRes] = await Promise.all([
      supabase
        .from("tilda_orders")
        .select(COURIER_ORDER_COLUMNS)
        .eq("status", "confirmed")
        .is("assigned_courier_id", null)
        // Самовывоз не должен попадать в курьерский пул — такие заказы
        // менеджер передаёт флористу напрямую, курьеру ехать некуда.
        .ilike("delivery_type", "%kurýrem%")
        .order("delivery_date", { ascending: true }),
      supabase
        .from("tilda_orders")
        .select(COURIER_ORDER_COLUMNS)
        .eq("assigned_courier_id", user.id)
        .in("status", MINE_STATUSES)
        .order("delivery_date", { ascending: true }),
    ]);

    if (poolRes.error || mineRes.error) {
      setError(poolRes.error?.message ?? mineRes.error?.message ?? "Ошибка загрузки");
    } else {
      setError(null);
      setPool(poolRes.data ?? []);
      setMine(mineRes.data ?? []);
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh("tilda_orders", load);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  const groups = new Map<string, CourierOrder[]>();
  for (const o of mine) {
    const key = groupKey(o);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600 dark:text-red-400">Ошибка: {error}</p>}

      <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1 text-sm">
        <button
          onClick={() => setTab("mine")}
          className={`flex-1 rounded-md py-1.5 font-medium ${
            tab === "mine" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300"
          }`}
        >
          Мои ({mine.length})
        </button>
        <button
          onClick={() => setTab("pool")}
          className={`flex-1 rounded-md py-1.5 font-medium ${
            tab === "pool" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300"
          }`}
        >
          Доступные ({pool.length})
        </button>
        <button
          onClick={() => setTab("earnings")}
          className={`flex-1 rounded-md py-1.5 font-medium ${
            tab === "earnings" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300"
          }`}
        >
          Заработок
        </button>
      </div>

      {tab === "mine" && (
        <section className="space-y-4">
          {mine.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">Нет активных заказов.</p>}
          {[...groups.entries()].map(([key, orders]) => (
            <MineOrdersGroup
              key={key}
              date={orders[0].delivery_date}
              slot={orders[0].delivery_slot}
              orders={orders}
              userId={user.id}
              onDone={load}
            />
          ))}
        </section>
      )}

      {tab === "pool" && (
        <section className="space-y-2">
          {pool.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">Пул пуст.</p>}
          <div className="space-y-2">
            {pool.map((o) => (
              <CourierOrderCard key={o.id} order={o} mode="pool" userId={user.id} onDone={load} />
            ))}
          </div>
        </section>
      )}

      {tab === "earnings" && <CourierEarnings />}
    </div>
  );
}
