"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { statusLabel } from "@/lib/order-status";
import { formatDateTime } from "@/lib/format";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type OrderLogRow = {
  id: string;
  status: string;
  changed_at: string | null;
  note: string | null;
  order: {
    id: string;
    order_id: string | null;
    customer_name: string | null;
    recipient_name: string | null;
  } | null;
  changed_by_user: { full_name: string | null } | null;
};

type ActivityLogRow = {
  id: string;
  action: string;
  details: string | null;
  customer_email: string;
  created_at: string | null;
  actor: { full_name: string | null } | null;
};

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  points_accrual: "Начислены баллы",
  points_redemption: "Списаны баллы",
  deposit_topup: "Пополнен депозит",
  deposit_deduct: "Списан депозит",
  date_added: "Добавлена важная дата",
  date_deleted: "Удалена важная дата",
  birthday_set: "Указан день рождения",
};

export default function LogsPage() {
  const { profile } = useDashboard();
  const [tab, setTab] = useState<"orders" | "customers">("orders");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<OrderLogRow[]>([]);
  const [activity, setActivity] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    // No setLoading(true) — see the same note in CourierView.tsx.
    const supabase = createClient();

    let query = supabase
      .from("order_status_history")
      .select(
        "id, status, changed_at, note, order:tilda_orders!inner(id, order_id, customer_name, recipient_name), changed_by_user:users(full_name)",
      )
      .order("changed_at", { ascending: false })
      .limit(200);

    if (search.trim()) {
      query = query.ilike("order.order_id", `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setLogs((data as unknown as OrderLogRow[]) ?? []);
    }
    setLoading(false);
  }, [search]);

  const loadActivity = useCallback(async () => {
    const supabase = createClient();

    let query = supabase
      .from("customer_activity_log")
      .select("id, action, details, customer_email, created_at, actor:users(full_name)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (search.trim()) {
      query = query.ilike("customer_email", `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setActivity((data as unknown as ActivityLogRow[]) ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    if (profile?.role !== "manager") return;
    setLoading(true);
    const timer = setTimeout(() => {
      if (tab === "orders") loadOrders();
      else loadActivity();
    }, 250);
    return () => clearTimeout(timer);
  }, [tab, loadOrders, loadActivity, profile?.role]);

  useRealtimeRefresh("order_status_history", () => {
    if (profile?.role === "manager" && tab === "orders") loadOrders();
  });

  useRealtimeRefresh("customer_activity_log", () => {
    if (profile?.role === "manager" && tab === "customers") loadActivity();
  });

  if (profile?.role !== "manager") {
    return null;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Логи</h1>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="mb-3 flex gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 p-0.5">
          <button
            onClick={() => setTab("orders")}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === "orders" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            Заказы
          </button>
          <button
            onClick={() => setTab("customers")}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === "customers" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            Клиенты
          </button>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {tab === "orders" ? "Номер заказа" : "Email клиента"}
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="оставьте пустым, чтобы увидеть всё"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error && <p className="text-red-600 dark:text-red-400">Ошибка загрузки: {error}</p>}

      {tab === "orders" ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left text-xs text-zinc-500 dark:text-zinc-400">
                <th className="px-3 py-2">Когда</th>
                <th className="px-3 py-2">Заказ</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Кто</th>
                <th className="px-3 py-2">Заметка</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    Загрузка…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    Ничего не найдено
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {formatDateTime(log.changed_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      #{log.order?.order_id} · {log.order?.customer_name} → {log.order?.recipient_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{statusLabel(log.status)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {log.changed_by_user?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{log.note ?? ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left text-xs text-zinc-500 dark:text-zinc-400">
                <th className="px-3 py-2">Когда</th>
                <th className="px-3 py-2">Клиент</th>
                <th className="px-3 py-2">Действие</th>
                <th className="px-3 py-2">Детали</th>
                <th className="px-3 py-2">Кто</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    Загрузка…
                  </td>
                </tr>
              ) : activity.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    Ничего не найдено
                  </td>
                </tr>
              ) : (
                activity.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {formatDateTime(a.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{a.customer_email}</td>
                    <td className="whitespace-nowrap px-3 py-2">{ACTIVITY_ACTION_LABELS[a.action] ?? a.action}</td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{a.details ?? ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {a.actor?.full_name ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
