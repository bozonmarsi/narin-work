"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities, formatDateTime } from "@/lib/format";
import { statusLabel, statusColor, isPickupOrder } from "@/lib/order-status";
import { NewOrderModal } from "./NewOrderModal";
import { OrderAssembleModal } from "./OrderAssembleModal";

const VISIBLE_STATUSES = ["confirmed", "courier_assigned", "assembling", "assembled", "in_transit"];
const ASSEMBLABLE_STATUSES = ["confirmed", "courier_assigned"];

type OrderLite = {
  id: string;
  order_id: string | null;
  customer_name: string | null;
  recipient_name: string | null;
  delivery_date: string | null;
  delivery_slot: string | null;
  delivery_type: string | null;
  products_text: string | null;
  status: string | null;
  raw_payload: { payment?: { products?: { name?: string; quantity?: number }[] } } | null;
};

type StickerLite = { id: string; product_name: string; category: string | null; unit: string | null; order_unit_size: number; price: number | null };
type RecipeLite = { bouquet_sticker_id: string; ingredient_sticker_id: string; quantity_needed: number };

function itemsSummary(order: OrderLite): string {
  const items = order.raw_payload?.payment?.products;
  if (items && items.length > 0) {
    return items.map((p) => `${decodeHtmlEntities(p.name ?? "")} × ${p.quantity ?? 1}`).join(", ");
  }
  return (order.products_text ?? "").split("\n").join(", ");
}

export function OrdersView() {
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [stickers, setStickers] = useState<StickerLite[]>([]);
  const [recipes, setRecipes] = useState<RecipeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [assembleOrder, setAssembleOrder] = useState<OrderLite | null>(null);

  async function load() {
    const supabase = createClient();
    const [ordersRes, stickersRes, recipesRes] = await Promise.all([
      supabase
        .from("tilda_orders")
        .select("id, order_id, customer_name, recipient_name, delivery_date, delivery_slot, delivery_type, products_text, status, raw_payload")
        .in("status", VISIBLE_STATUSES)
        .order("delivery_date", { ascending: true }),
      supabase.from("product_stickers").select("id, product_name, category, unit, order_unit_size, price"),
      supabase.from("product_recipes").select("bouquet_sticker_id, ingredient_sticker_id, quantity_needed"),
    ]);
    setOrders(ordersRes.data ?? []);
    setStickers(stickersRes.data ?? []);
    setRecipes(recipesRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function markDelivered(orderId: string) {
    const supabase = createClient();
    await supabase.from("tilda_orders").update({ status: "delivered" }).eq("id", orderId);
    load();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Заказы</h1>
        <button
          onClick={() => setNewOrderOpen(true)}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover"
        >
          + Новый заказ
        </button>
      </div>

      {orders.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 py-10 text-center text-sm text-zinc-400">
          Нет активных заказов
        </p>
      )}

      <div className="space-y-2.5">
        {orders.map((order) => {
          const canAssemble = ASSEMBLABLE_STATUSES.includes(order.status ?? "");
          const canMarkDelivered = order.status === "assembled" && isPickupOrder(order.delivery_type);
          return (
            <div
              key={order.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">№{order.order_id ?? "—"}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(order.status)}`}>{statusLabel(order.status)}</span>
                </div>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">{order.recipient_name ?? order.customer_name ?? "—"}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-400">{itemsSummary(order)}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {order.delivery_date ? formatDateTime(order.delivery_date) : "—"} {order.delivery_slot ?? ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canMarkDelivered && (
                  <button
                    onClick={() => markDelivered(order.id)}
                    className="rounded-xl border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Выдано
                  </button>
                )}
                {canAssemble && (
                  <button
                    onClick={() => setAssembleOrder(order)}
                    className="rounded-xl bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
                  >
                    Собрать
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {newOrderOpen && (
        <NewOrderModal
          stickers={stickers.filter((s) => s.product_name !== "__default__")}
          onClose={() => setNewOrderOpen(false)}
          onCreated={load}
        />
      )}

      {assembleOrder && (
        <OrderAssembleModal
          order={assembleOrder}
          stickers={stickers}
          recipes={recipes}
          onClose={() => setAssembleOrder(null)}
          onDone={() => {
            setAssembleOrder(null);
            load();
          }}
        />
      )}
    </div>
  );
}
