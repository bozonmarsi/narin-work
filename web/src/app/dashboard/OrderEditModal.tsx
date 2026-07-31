"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALL_STATUSES, statusLabel } from "@/lib/order-status";
import { formatDateTime, decodeHtmlEntities } from "@/lib/format";
import { parseSlotRange } from "@/lib/schedule";
import type { OrderRow, CourierOption, ProductOption, RawPayloadProduct } from "./types";

const FIELD_LABELS: Record<string, string> = {
  customer_name: "Имя заказчика",
  customer_last_name: "Фамилия заказчика",
  customer_phone: "Телефон заказчика",
  customer_email: "Email заказчика",
  recipient_name: "Имя получателя",
  recipient_phone: "Телефон получателя",
  address: "Адрес",
  city: "Город",
  psk: "Индекс",
  patro: "Этаж",
  cislo_bytu: "Квартира",
  kod_intercomu: "Код домофона",
  company_name: "Компания",
  delivery_date: "Дата доставки",
  delivery_slot: "Слот доставки",
  delivery_window_start: "Не раньше",
  delivery_window_end: "Не позже",
  comments: "Комментарий",
  manager_comment: "Комментарий менеджера",
  florist_comment: "Комментарий флориста",
  status: "Статус",
  assigned_courier_id: "Курьер",
  cancelled_reason: "Причина отмены",
  payment_status: "Статус оплаты",
};

type ProductItem = {
  name: string; // decoded, shown in the editable field
  rawName: string; // literal original string — Tilda's HTML-entity mess included —
  // kept so the sticker lookup (which matches product_stickers.product_name
  // verbatim) keeps working for items the manager didn't actually rename.
  price: string;
  quantity: string;
  // Anything else Tilda/other automation attached to this product (unit,
  // portion, sticker fields we don't know the name of, etc.) — preserved
  // untouched so re-saving never silently drops data we don't manage.
  extra?: Record<string, unknown>;
};

// Same convention as delivery_date elsewhere in this app: stored as naive
// UTC with no real timezone meaning, just a way to keep a date+time pair
// sortable/comparable without pulling in timezone math nobody needs here.
function timeToTimestamp(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes)).toISOString();
}

function itemsFromOrder(order: OrderRow): ProductItem[] {
  const rawProducts = order.raw_payload?.payment?.products;
  if (rawProducts && rawProducts.length > 0) {
    return rawProducts.map((p) => {
      const { name, price, amount, quantity, ...rest } = p as RawPayloadProduct & Record<string, unknown>;
      return {
        name: decodeHtmlEntities(name ?? ""),
        rawName: name ?? "",
        price: price ?? (amount && quantity ? String(Number(amount) / Number(quantity)) : "0"),
        quantity: String(quantity ?? 1),
        extra: rest,
      };
    });
  }
  return [];
}

export function OrderEditModal({
  order,
  couriers,
  products,
  paymentStatuses,
  onClose,
  onSaved,
}: {
  order: OrderRow;
  couriers: CourierOption[];
  products: ProductOption[];
  paymentStatuses: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    customer_name: order.customer_name ?? "",
    customer_last_name: order.customer_last_name ?? "",
    customer_phone: order.customer_phone ?? "",
    customer_email: order.customer_email ?? "",
    recipient_name: order.recipient_name ?? "",
    recipient_phone: order.recipient_phone ?? "",
    address: order.address ?? "",
    city: order.city ?? "",
    psk: order.psk ?? "",
    patro: order.patro ?? "",
    cislo_bytu: order.cislo_bytu ?? "",
    kod_intercomu: order.kod_intercomu ?? "",
    company_name: order.company_name ?? "",
    delivery_date: order.delivery_date ? order.delivery_date.slice(0, 10) : "",
    delivery_slot: order.delivery_slot ?? "",
    delivery_window_start: order.delivery_window_start ? order.delivery_window_start.slice(11, 16) : "",
    delivery_window_end: order.delivery_window_end ? order.delivery_window_end.slice(11, 16) : "",
    comments: order.comments ?? "",
    manager_comment: order.manager_comment ?? "",
    florist_comment: order.florist_comment ?? "",
    status: order.status ?? "new",
    assigned_courier_id: order.assigned_courier_id ?? "",
    cancelled_reason: order.cancelled_reason ?? "",
    payment_status: order.payment_status ?? "",
  });
  const [items, setItems] = useState<ProductItem[]>(() => itemsFromOrder(order));
  const [itemsDirty, setItemsDirty] = useState(false);
  const [newProduct, setNewProduct] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copyOrderId() {
    if (!order.order_id) return;
    navigator.clipboard.writeText(order.order_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const slotRange = parseSlotRange(form.delivery_slot);
  const windowOutsideSlot =
    slotRange &&
    ((form.delivery_window_start && parseInt(form.delivery_window_start, 10) < slotRange.start) ||
      (form.delivery_window_end && parseInt(form.delivery_window_end, 10) > slotRange.end));

  const deliveryFee = Math.max((order.order_total ?? 0) - (order.goods_total ?? 0), 0);
  const subtotal = items.reduce(
    (sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0),
    0,
  );

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateItem(index: number, patch: Partial<ProductItem>) {
    setItems((list) => list.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    setItemsDirty(true);
  }

  function removeItem(index: number) {
    setItems((list) => list.filter((_, i) => i !== index));
    setItemsDirty(true);
  }

  function addProduct() {
    if (!newProduct) return;
    const catalogEntry = products.find((p) => p.name === newProduct);
    setItems((list) => [
      ...list,
      {
        name: newProduct,
        rawName: catalogEntry?.rawName ?? newProduct,
        price: newPrice || "0",
        quantity: newQty || "1",
      },
    ]);
    setItemsDirty(true);
    setNewProduct("");
    setNewQty("1");
    setNewPrice("");
  }

  async function handleSave() {
    if (form.delivery_window_start && form.delivery_window_end && form.delivery_window_start >= form.delivery_window_end) {
      setError('"Не раньше" должно быть раньше "не позже" — проверьте время');
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Не авторизован");
      setSaving(false);
      return;
    }

    const changedFields: string[] = [];
    const payload: Record<string, unknown> = {};

    const textCompare: [keyof typeof form, string | null][] = [
      ["customer_name", order.customer_name],
      ["customer_last_name", order.customer_last_name],
      ["customer_phone", order.customer_phone],
      ["customer_email", order.customer_email],
      ["recipient_name", order.recipient_name],
      ["recipient_phone", order.recipient_phone],
      ["address", order.address],
      ["city", order.city],
      ["psk", order.psk],
      ["patro", order.patro],
      ["cislo_bytu", order.cislo_bytu],
      ["kod_intercomu", order.kod_intercomu],
      ["company_name", order.company_name],
      ["delivery_slot", order.delivery_slot],
      ["comments", order.comments],
      ["manager_comment", order.manager_comment],
      ["florist_comment", order.florist_comment],
      ["cancelled_reason", order.cancelled_reason],
      ["payment_status", order.payment_status],
    ];

    for (const [key, original] of textCompare) {
      const value = form[key] || null;
      if (value !== (original ?? null)) {
        payload[key] = value;
        changedFields.push(FIELD_LABELS[key] ?? key);
      }
    }

    const originalDate = order.delivery_date ? order.delivery_date.slice(0, 10) : "";
    if (form.delivery_date !== originalDate && form.delivery_date) {
      payload.delivery_date = form.delivery_date;
      changedFields.push(FIELD_LABELS.delivery_date);
    }

    const originalWindowStart = order.delivery_window_start ? order.delivery_window_start.slice(11, 16) : "";
    const originalWindowEnd = order.delivery_window_end ? order.delivery_window_end.slice(11, 16) : "";
    const dateForWindow = form.delivery_date || originalDate;
    if (form.delivery_window_start !== originalWindowStart) {
      payload.delivery_window_start = form.delivery_window_start && dateForWindow
        ? timeToTimestamp(dateForWindow, form.delivery_window_start)
        : null;
      changedFields.push(FIELD_LABELS.delivery_window_start);
    }
    if (form.delivery_window_end !== originalWindowEnd) {
      payload.delivery_window_end = form.delivery_window_end && dateForWindow
        ? timeToTimestamp(dateForWindow, form.delivery_window_end)
        : null;
      changedFields.push(FIELD_LABELS.delivery_window_end);
    }

    let effectiveStatus = form.status;
    const courierChanged = (form.assigned_courier_id || null) !== (order.assigned_courier_id ?? null);
    if (courierChanged) {
      payload.assigned_courier_id = form.assigned_courier_id || null;
      // Assigning a courier while the manager left the status untouched at
      // "confirmed" used to leave the order invisible to everyone — not in
      // the pool any more (it has a courier), not in the courier's "mine"
      // list either (that only shows courier_assigned+). Bump it forward so
      // assigning a courier always means the order is actually reachable.
      if (form.assigned_courier_id && form.status === "confirmed" && order.status === "confirmed") {
        effectiveStatus = "courier_assigned";
      }
    }

    const statusChanged = effectiveStatus !== order.status;
    if (statusChanged) {
      payload.status = effectiveStatus;
    }

    if (itemsDirty) {
      const validItems = items.filter((i) => i.name.trim());
      const newTotal = subtotal + deliveryFee;

      payload.products_text = validItems.map((i) => `${i.name} x ${i.quantity}`).join("\n");
      payload.goods_total = subtotal;
      payload.order_total = newTotal;
      payload.raw_payload = {
        ...(order.raw_payload ?? {}),
        payment: {
          ...(order.raw_payload?.payment ?? {}),
          products: validItems.map((i) => ({
            ...(i.extra ?? {}),
            // Untouched items keep their exact original name (matches
            // product_stickers.product_name, entities and all) so the
            // sticker lookup in the client cabinet doesn't break; only a
            // name the manager actually retyped goes in as fresh text.
            name: i.name === decodeHtmlEntities(i.rawName) ? i.rawName : i.name,
            price: i.price,
            quantity: Number(i.quantity) || 0,
            amount: (Number(i.price) || 0) * (Number(i.quantity) || 0),
          })),
          subtotal: String(subtotal),
          amount: String(newTotal),
        },
      };
      changedFields.push("Товары");
    }

    // Anything touching where/when/who delivers invalidates a previously
    // built route — the courier's app flags this so they know to press
    // "Пересчитать маршрут" instead of silently driving a stale plan.
    const routeAffectingFields = [
      "address",
      "city",
      "delivery_date",
      "delivery_slot",
      "delivery_window_start",
      "delivery_window_end",
      "assigned_courier_id",
    ];
    if (routeAffectingFields.some((f) => f in payload)) {
      payload.route_sequence = null;
    }

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    const { error: updateError } = await supabase.from("tilda_orders").update(payload).eq("id", order.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    if (statusChanged) {
      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: effectiveStatus,
        changed_by: user.id,
        note: "Статус изменён вручную менеджером",
      });
    }

    if (courierChanged) {
      const courierName = couriers.find((c) => c.id === form.assigned_courier_id)?.full_name ?? "не назначен";
      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: effectiveStatus,
        changed_by: user.id,
        note: `Курьер изменён: ${courierName}`,
      });
    }

    if (changedFields.length > 0) {
      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: effectiveStatus,
        changed_by: user.id,
        note: `Изменены поля: ${changedFields.join(", ")}`,
      });
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <button
              type="button"
              onClick={copyOrderId}
              className="text-lg font-semibold hover:text-accent"
              title="Скопировать номер заказа"
            >
              Заказ #{order.order_id} {copied ? "✓" : "📋"}
            </button>
            <p className="text-sm text-zinc-500">создан {formatDateTime(order.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Статус и курьер</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Статус">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Курьер">
                <select
                  value={form.assigned_courier_id}
                  onChange={(e) => set("assigned_courier_id", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Не назначен</option>
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name ?? c.id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {form.status === "cancelled" && (
              <Field label="Причина отмены">
                <input
                  value={form.cancelled_reason}
                  onChange={(e) => set("cancelled_reason", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Заказчик</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Имя">
                <input
                  value={form.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Фамилия">
                <input
                  value={form.customer_last_name}
                  onChange={(e) => set("customer_last_name", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Телефон">
                <input
                  value={form.customer_phone}
                  onChange={(e) => set("customer_phone", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Email">
                <input
                  value={form.customer_email}
                  onChange={(e) => set("customer_email", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Товары и оплата</h3>
            <p className="text-xs text-zinc-400">
              Меняет и человекочитаемый список, и структуру, которую читает личный кабинет клиента —
              они больше не разъезжаются.
            </p>

            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(index, { name: e.target.value })}
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    className="w-16 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    title="Количество"
                  />
                  <span className="text-xs text-zinc-400">×</span>
                  <input
                    type="number"
                    value={item.price}
                    onChange={(e) => updateItem(index, { price: e.target.value })}
                    className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    title="Цена за штуку, Kč"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-zinc-400 hover:text-red-600"
                    aria-label="Удалить"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-zinc-400">Товары не добавлены</p>}
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-md bg-zinc-50 p-2">
              <Field label="Добавить из каталога">
                <select
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                  className="w-52 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Выбрать цветок…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Кол-во">
                <input
                  type="number"
                  min="1"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-16 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Цена за шт (Kč)">
                <input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <button
                type="button"
                onClick={addProduct}
                disabled={!newProduct}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-white disabled:opacity-50"
              >
                Добавить
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Статус оплаты">
                <select
                  value={form.payment_status}
                  onChange={(e) => set("payment_status", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  {!paymentStatuses.includes(form.payment_status) && form.payment_status && (
                    <option value={form.payment_status}>{form.payment_status}</option>
                  )}
                  {paymentStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="text-sm">
                <span className="block text-xs font-medium text-zinc-500">Товары</span>
                <span className="block py-1.5">{subtotal} Kč</span>
              </div>
              <div className="text-sm">
                <span className="block text-xs font-medium text-zinc-500">Итого (+ доставка {deliveryFee} Kč)</span>
                <span className="block py-1.5 font-medium">{subtotal + deliveryFee} Kč</span>
              </div>
            </div>
            <p className="text-xs text-zinc-400">Способ оплаты: {order.payment_method ?? "—"} (только просмотр)</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Доставка</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дата доставки">
                <input
                  type="date"
                  value={form.delivery_date}
                  onChange={(e) => set("delivery_date", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Слот (например 9-12)">
                <input
                  value={form.delivery_slot}
                  onChange={(e) => set("delivery_slot", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Пожелание клиента: не раньше">
                <input
                  type="time"
                  value={form.delivery_window_start}
                  onChange={(e) => set("delivery_window_start", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Пожелание клиента: не позже">
                <input
                  type="time"
                  value={form.delivery_window_end}
                  onChange={(e) => set("delivery_window_end", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            {windowOutsideSlot && (
              <p className="text-xs text-orange-600">
                Пожелание по времени выходит за пределы слота &laquo;{form.delivery_slot}&raquo; — проверьте, не
                опечатка ли это
              </p>
            )}
            <Field label="Адрес">
              <input
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Город">
                <input
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Индекс">
                <input
                  value={form.psk}
                  onChange={(e) => set("psk", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Этаж">
                <input
                  value={form.patro}
                  onChange={(e) => set("patro", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Квартира">
                <input
                  value={form.cislo_bytu}
                  onChange={(e) => set("cislo_bytu", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Код домофона">
                <input
                  value={form.kod_intercomu}
                  onChange={(e) => set("kod_intercomu", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Компания">
                <input
                  value={form.company_name}
                  onChange={(e) => set("company_name", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Получатель</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Имя получателя">
                <input
                  value={form.recipient_name}
                  onChange={(e) => set("recipient_name", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Телефон получателя">
                <input
                  value={form.recipient_phone}
                  onChange={(e) => set("recipient_phone", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <Field label="Комментарий клиента">
              <textarea
                value={form.comments}
                onChange={(e) => set("comments", e.target.value)}
                rows={2}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </Field>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Для курьера (внутренние заметки)</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Комментарий менеджера">
                <textarea
                  value={form.manager_comment}
                  onChange={(e) => set("manager_comment", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Комментарий флориста">
                <textarea
                  value={form.florist_comment}
                  onChange={(e) => set("florist_comment", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
          </section>

          {order.postcard_comment && (
            <p className="text-sm text-zinc-500">Открытка: {order.postcard_comment}</p>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
