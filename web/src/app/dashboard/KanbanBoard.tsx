"use client";

import { KANBAN_STATUSES, statusLabel, isPickupOrder } from "@/lib/order-status";
import { formatDate } from "@/lib/format";
import { OrderActions } from "./order-actions";
import { AssignCourier } from "./AssignCourier";
import { PickupActions } from "./PickupActions";
import type { OrderRow, CourierOption } from "./types";

export function KanbanBoard({
  orders,
  couriers,
  onSelect,
  onDone,
}: {
  orders: OrderRow[];
  couriers: CourierOption[];
  onSelect: (order: OrderRow) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {KANBAN_STATUSES.map((status) => {
        const columnOrders = orders.filter((o) => o.status === status);
        return (
          <div key={status} className="w-72 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-zinc-700">{statusLabel(status)}</h3>
              <span className="text-xs text-zinc-400">{columnOrders.length}</span>
            </div>
            <div className="space-y-2">
              {columnOrders.map((order) => (
                <div
                  key={order.id}
                  className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm hover:border-accent"
                  onClick={() => onSelect(order)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">#{order.order_id}</p>
                    {order.subscription_id && (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        🔁 Předplatné
                      </span>
                    )}
                    {isPickupOrder(order.delivery_type) && (
                      <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                        🏪 Самовывоз
                      </span>
                    )}
                    {order.problem_reported && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                        Проблема
                      </span>
                    )}
                    {order.transfer_requested && (
                      <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                        Перенос
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-600">
                    {order.customer_name} → {order.recipient_name}
                  </p>
                  <p className="text-zinc-500">
                    {order.address}, {order.city}
                  </p>
                  <p className="text-zinc-500">
                    {formatDate(order.delivery_date)}
                    {order.delivery_slot ? ` · ${order.delivery_slot}` : ""}
                    {order.delivery_time_raw ? ` · ${order.delivery_time_raw}` : ""}
                  </p>
                  <p className="text-zinc-500">{order.products_text}</p>
                  <p className="text-zinc-500">
                    {order.order_total} Kč · {order.payment_method} · {order.payment_status}
                  </p>
                  {order.assigned_courier?.full_name && (
                    <p className="text-zinc-500">Курьер: {order.assigned_courier.full_name}</p>
                  )}
                  {order.status === "new" && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <OrderActions orderId={order.id} onDone={onDone} />
                    </div>
                  )}
                  {order.status === "confirmed" && !order.assigned_courier_id && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      {isPickupOrder(order.delivery_type) ? (
                        <PickupActions orderId={order.id} status={order.status} onDone={onDone} />
                      ) : (
                        <AssignCourier orderId={order.id} couriers={couriers} onDone={onDone} />
                      )}
                    </div>
                  )}
                  {order.status === "assembled" && isPickupOrder(order.delivery_type) && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <PickupActions orderId={order.id} status={order.status} onDone={onDone} />
                    </div>
                  )}
                </div>
              ))}
              {columnOrders.length === 0 && (
                <p className="rounded-lg border border-dashed border-zinc-200 p-3 text-center text-xs text-zinc-400">
                  Пусто
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
