"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { OrderEditModal } from "../OrderEditModal";
import { ORDER_COLUMNS } from "../queries";
import { statusLabel, statusColor } from "@/lib/order-status";
import { formatDate, decodeHtmlEntities } from "@/lib/format";
import { toDateKey, startOfMonth, todayUTC } from "@/lib/schedule";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import type { OrderRow, CourierOption, ProductOption } from "../types";

type StatusFilter = "delivered" | "cancelled" | "all";

export default function ArchivePage() {
  const { profile } = useDashboard();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

  const [dateFrom, setDateFrom] = useState(() => toDateKey(startOfMonth(todayUTC())));
  const [dateTo, setDateTo] = useState(() => toDateKey(todayUTC()));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("delivered");

  const load = useCallback(async () => {
    // No setLoading(true) — see the same note in CourierView.tsx.
    const supabase = createClient();

    let query = supabase
      .from("tilda_orders")
      .select(ORDER_COLUMNS)
      .gte("delivery_date", dateFrom)
      .lt("delivery_date", dateTo + "T23:59:59")
      .order("delivery_date", { ascending: false });

    if (statusFilter === "all") {
      query = query.in("status", ["delivered", "cancelled"]);
    } else {
      query = query.eq("status", statusFilter);
    }

    if (search.trim()) {
      const term = search.trim();
      query = query.or(
        `order_id.ilike.%${term}%,customer_name.ilike.%${term}%,recipient_name.ilike.%${term}%`,
      );
    }

    const { data, error } = await query;
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setOrders((data as unknown as OrderRow[]) ?? []);
    }
    setLoading(false);
  }, [dateFrom, dateTo, search, statusFilter]);

  useEffect(() => {
    if (profile?.role === "manager") {
      load();
    }
  }, [profile?.role, load]);

  useRealtimeRefresh("tilda_orders", () => {
    if (profile?.role === "manager") load();
  });

  useEffect(() => {
    if (profile?.role !== "manager") return;
    const supabase = createClient();
    (async () => {
      const [couriersRes, productsRes, statusRows] = await Promise.all([
        supabase.from("users").select("id, full_name").eq("role", "courier"),
        supabase.from("product_stickers").select("id, product_name, image_url").order("product_name"),
        supabase.from("tilda_orders").select("payment_status"),
      ]);
      if (!couriersRes.error) setCouriers(couriersRes.data ?? []);
      if (!productsRes.error) {
        setProducts(
          (productsRes.data ?? [])
            .filter((p) => p.product_name && p.product_name !== "__default__")
            .map((p) => ({
              id: p.id,
              name: decodeHtmlEntities(p.product_name),
              rawName: p.product_name,
              image_url: p.image_url ?? null,
            })),
        );
      }
      if (!statusRows.error) {
        const unique = Array.from(
          new Set((statusRows.data ?? []).map((r) => r.payment_status).filter(Boolean)),
        ) as string[];
        setPaymentStatuses(unique);
      }
    })();
  }, [profile?.role]);

  if (profile?.role !== "manager") {
    return null;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Архив заказов</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <label className="space-y-1 text-sm">
          <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">С</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">По</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Статус</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
          >
            <option value="delivered">Доставленные</option>
            <option value="cancelled">Отменённые</option>
            <option value="all">Все завершённые</option>
          </select>
        </label>
        <label className="flex-1 space-y-1 text-sm">
          <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Поиск (номер, имя)</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="#1556267153 или Magomed"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {error && <p className="text-red-600 dark:text-red-400">Ошибка загрузки: {error}</p>}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left text-xs text-zinc-500 dark:text-zinc-400">
              <th className="px-3 py-2">Заказ</th>
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2">Адрес</th>
              <th className="px-3 py-2">Товары</th>
              <th className="px-3 py-2">Сумма</th>
              <th className="px-3 py-2">Курьер</th>
              <th className="px-3 py-2">Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  Загрузка…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="cursor-pointer border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <td className="px-3 py-2">
                    <p className="font-medium">#{order.order_id}</p>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      {order.customer_name} → {order.recipient_name}
                    </p>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(order.delivery_date)}</td>
                  <td className="px-3 py-2">
                    {order.address}, {order.city}
                  </td>
                  <td className="px-3 py-2">{order.products_text}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{order.order_total} Kč</td>
                  <td className="px-3 py-2 whitespace-nowrap">{order.assigned_courier?.full_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <OrderEditModal
          order={selectedOrder}
          couriers={couriers}
          products={products}
          paymentStatuses={paymentStatuses}
          onClose={() => setSelectedOrder(null)}
          onSaved={() => {
            setSelectedOrder(null);
            load();
          }}
        />
      )}
    </div>
  );
}
