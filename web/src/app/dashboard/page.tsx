"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "./layout";
import { CalendarView } from "./CalendarView";
import { KanbanBoard } from "./KanbanBoard";
import { OrderEditModal } from "./OrderEditModal";
import { ORDER_COLUMNS } from "./queries";
import { statusLabel } from "@/lib/order-status";
import { decodeHtmlEntities } from "@/lib/format";
import { CourierView } from "./courier/CourierView";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import type { OrderRow, CourierOption, ProductOption } from "./types";

export default function DashboardPage() {
  const { profile } = useDashboard();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    if (profile?.role !== "manager") return;
    const supabase = createClient();

    (async () => {
      const { data, error } = await supabase
        .from("product_stickers")
        .select("id, product_name, image_url")
        .order("product_name", { ascending: true });
      if (!error) {
        setProducts(
          (data ?? [])
            .filter((p) => p.product_name && p.product_name !== "__default__")
            .map((p) => ({
              id: p.id,
              name: decodeHtmlEntities(p.product_name),
              rawName: p.product_name,
              image_url: p.image_url ?? null,
            })),
        );
      } else {
        console.error("product_stickers fetch error", error);
      }

      const { data: statusRows, error: statusError } = await supabase
        .from("tilda_orders")
        .select("payment_status");
      if (!statusError) {
        const unique = Array.from(
          new Set((statusRows ?? []).map((r) => r.payment_status).filter(Boolean)),
        ) as string[];
        setPaymentStatuses(unique);
      }
    })();
  }, [profile?.role]);

  const loadKanban = useCallback(async () => {
    // No setLoading(true) — this also fires on background Realtime updates;
    // see the same note in CourierView.tsx.
    setRefreshSignal((n) => n + 1);
    const supabase = createClient();

    const [ordersRes, couriersRes] = await Promise.all([
      // Broader than the Kanban columns on purpose: "problem" and
      // "transfer_pending" orders aren't shown as Kanban columns, but they
      // still need to surface in the attention banner above it.
      supabase
        .from("tilda_orders")
        .select(ORDER_COLUMNS)
        .not("status", "in", "(delivered,cancelled)")
        .order("delivery_date", { ascending: true }),
      supabase.from("users").select("id, full_name").eq("role", "courier"),
    ]);

    if (ordersRes.error) {
      setLoadError(ordersRes.error.message);
    } else {
      setLoadError(null);
      setOrders((ordersRes.data as unknown as OrderRow[]) ?? []);
    }

    if (!couriersRes.error) {
      setCouriers(couriersRes.data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile?.role === "manager") {
      loadKanban();
    }
  }, [profile?.role, loadKanban]);

  useRealtimeRefresh("tilda_orders", () => {
    if (profile?.role === "manager") loadKanban();
  });

  if (profile?.role === "courier") {
    return <CourierView />;
  }

  if (profile?.role !== "manager") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <p className="text-zinc-600">
          Кабинет для вашей роли (
          {profile?.role === "warehouse" ? "склад" : "не назначена"}) ещё не готов. Пока доступны
          кабинеты менеджера и курьера.
        </p>
      </div>
    );
  }

  const attention = orders.filter((o) => o.problem_reported || o.transfer_requested);

  async function dismissAttention(order: OrderRow) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("tilda_orders")
      .update({ problem_reported: false, transfer_requested: false })
      .eq("id", order.id);

    if (user) {
      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: order.status ?? "confirmed",
        changed_by: user.id,
        note: "Уведомление закрыто менеджером",
      });
    }

    loadKanban();
  }

  return (
    <div className="space-y-8">
      {loadError && <p className="text-red-600">Ошибка загрузки: {loadError}</p>}

      {attention.length > 0 && (
        <section className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-700">Требует внимания ({attention.length})</h2>
          <div className="space-y-1">
            {attention.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedOrder(o)}
                  className="flex-1 rounded-md bg-white px-3 py-2 text-left text-sm hover:border-accent"
                >
                  <span className="font-medium">#{o.order_id}</span> · {o.customer_name} →{" "}
                  {o.recipient_name} ·{" "}
                  {o.problem_reported ? "проблема" : ""}
                  {o.problem_reported && o.transfer_requested ? " / " : ""}
                  {o.transfer_requested ? "запрос переноса" : ""} · {statusLabel(o.status)}
                </button>
                <button
                  onClick={() => dismissAttention(o)}
                  title="Скрыть уведомление"
                  className="rounded-md border border-red-200 px-2 py-2 text-red-500 hover:bg-red-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <CalendarView onSelect={setSelectedOrder} refreshSignal={refreshSignal} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Активные заказы</h2>
        {loading ? (
          <p className="text-zinc-500">Загрузка…</p>
        ) : (
          <KanbanBoard orders={orders} couriers={couriers} onSelect={setSelectedOrder} onDone={loadKanban} />
        )}
      </section>

      {selectedOrder && (
        <OrderEditModal
          order={selectedOrder}
          couriers={couriers}
          products={products}
          paymentStatuses={paymentStatuses}
          onClose={() => setSelectedOrder(null)}
          onSaved={() => {
            setSelectedOrder(null);
            loadKanban();
          }}
        />
      )}
    </div>
  );
}
