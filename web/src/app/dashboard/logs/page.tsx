"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { statusLabel } from "@/lib/order-status";
import { formatDateTime } from "@/lib/format";

type LogRow = {
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

export default function LogsPage() {
  const { profile } = useDashboard();
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
      setLogs((data as unknown as LogRow[]) ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    if (profile?.role !== "manager") return;
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load, profile?.role]);

  if (profile?.role !== "manager") {
    return null;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Логи изменений заказов</h1>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-medium text-zinc-500">Номер заказа</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="оставьте пустым, чтобы увидеть всё"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error && <p className="text-red-600">Ошибка загрузки: {error}</p>}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
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
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                  Загрузка…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-zinc-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                    {formatDateTime(log.changed_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    #{log.order?.order_id} · {log.order?.customer_name} → {log.order?.recipient_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{statusLabel(log.status)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                    {log.changed_by_user?.full_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{log.note ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
