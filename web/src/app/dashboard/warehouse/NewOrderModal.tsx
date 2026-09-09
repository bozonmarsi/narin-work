"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities, formatDate } from "@/lib/format";
import { getCashbackPercent, maxRedeemablePoints } from "@/lib/loyalty";
import { Modal } from "./Modal";

type Sticker = { id: string; product_name: string; price: number | null; order_unit_size: number };
type Row = { key: string; stickerId: string; quantity: string; price: string };
type Customer = {
  email: string;
  balance: number;
  ma_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  orders_count: number;
  last_order_at: string | null;
  total_earned: number;
};
type FulfillmentMode = "pickup_now" | "pickup_later" | "courier";

function newRow(): Row {
  return { key: crypto.randomUUID(), stickerId: "", quantity: "1", price: "" };
}

const PAYMENT_METHODS: { value: string; label: string; icon: string }[] = [
  { value: "cash", label: "Наличными", icon: "💵" },
  { value: "card", label: "Картой", icon: "💳" },
  { value: "transfer", label: "Переводом", icon: "🏦" },
];

function atTime(hour: number, minute: number, addDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, minute, 0, 0);
  if (addDays === 0 && d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

const PICKUP_LATER_PRESETS: { label: string; getDate: () => Date }[] = [
  { label: "Через 1 час", getDate: () => new Date(Date.now() + 60 * 60000) },
  { label: "Через 2 часа", getDate: () => new Date(Date.now() + 120 * 60000) },
  { label: "Сегодня в 18:00", getDate: () => atTime(18, 0) },
  { label: "Завтра в 10:00", getDate: () => atTime(10, 0, 1) },
];

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Заказ "с кассы" — клиент стоит перед флористом, платит сразу и
// забирает букет на месте (или просит попозже/курьером). Заводится сразу
// в статусе "Подтверждён", поэтому дальше проходит через ту же сборку,
// что и обычные заказы с сайта — отдельного пути списания для него нет.
export function NewOrderModal({ stickers, onClose, onCreated }: { stickers: Sticker[]; onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("pickup_now");
  const [pickupLaterAt, setPickupLaterAt] = useState<string>(toDatetimeLocal(PICKUP_LATER_PRESETS[0].getDate()));
  const [courierAddress, setCourierAddress] = useState("");
  const [courierAt, setCourierAt] = useState<string>(toDatetimeLocal(atTime(12, 0)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Заказ уже создан (продажа физически состоялась), но начисление/
  // списание баллов не прошло — пересоздавать заказ повторным сабмитом
  // нельзя, форма просто ждёт, пока флорист закроет её сам.
  const [orderDone, setOrderDone] = useState(false);
  const rowRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  // Штрих-код на карте клиента (личный кабинет) кодирует её же ma_id —
  // сканер работает как клавиатура, вводит код и сразу жмёт Enter, так что
  // тут просто текстовое поле, без какого-либо драйвера.
  const [scanCode, setScanCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [redeemPoints, setRedeemPoints] = useState("0");

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function addRowAndFocus() {
    const row = newRow();
    setRows((prev) => [...prev, row]);
    setTimeout(() => rowRefs.current[row.key]?.focus(), 0);
  }

  async function lookupCustomer() {
    const code = scanCode.trim();
    if (!code) return;
    setScanning(true);
    setScanError(null);
    const supabase = createClient();
    const { data, error: lookupErr } = await supabase.rpc("lookup_customer_by_code", { p_code: code }).maybeSingle();
    setScanning(false);
    if (lookupErr || !data) {
      setScanError("Клиент с таким кодом не найден");
      return;
    }
    const found = data as Customer;
    setCustomer(found);
    setRedeemPoints("0");
    setScanCode("");
    if (found.customer_name) setCustomerName(found.customer_name);
    if (found.customer_phone) setCustomerPhone(found.customer_phone);
  }

  function detachCustomer() {
    setCustomer(null);
    setRedeemPoints("0");
    setScanError(null);
  }

  const validRows = rows.filter((r) => r.stickerId && parseFloat(r.quantity) > 0);
  const total = validRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0) * (parseFloat(r.price) || 0), 0);
  const maxRedeem = customer ? maxRedeemablePoints(total, customer.balance) : 0;
  const redeemAmount = customer ? Math.min(Math.max(0, parseFloat(redeemPoints) || 0), maxRedeem) : 0;
  const payable = Math.max(0, total - redeemAmount);
  const fulfillmentReady =
    fulfillment === "pickup_now" || (fulfillment === "pickup_later" && pickupLaterAt) || (fulfillment === "courier" && courierAddress.trim() && courierAt);
  const canSubmit = validRows.length > 0 && !!paymentMethod && !!fulfillmentReady && !submitting && !orderDone;

  async function submit() {
    if (!canSubmit || !paymentMethod) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    const products = validRows.map((r) => {
      const sticker = stickers.find((s) => s.id === r.stickerId);
      const qty = parseFloat(r.quantity);
      const price = parseFloat(r.price) || 0;
      return { name: sticker?.product_name ?? "", price: String(price), quantity: qty };
    });

    const now = new Date().toISOString();
    // Заказы с сайта получают номер от Tilda; кассовым нужен свой,
    // отдельно узнаваемый (как KASSA-, так и PREDPL- у подписок) —
    // иначе order_id остаётся пустым и заказ в списке показывает "№—".
    const orderId = "KASSA-" + crypto.randomUUID().split("-")[0].toUpperCase();
    const deliveryType = fulfillment === "courier" ? "Doručení kurýrem + servisní poplatek = 239" : "Servisní poplatek = 80";
    const deliveryDate =
      fulfillment === "courier" ? new Date(courierAt).toISOString() : fulfillment === "pickup_later" ? new Date(pickupLaterAt).toISOString() : now;

    const { data: order, error: insertErr } = await supabase
      .from("tilda_orders")
      .insert({
        order_id: orderId,
        customer_name: customerName.trim() || "Клиент с кассы",
        recipient_name: customerName.trim() || "Клиент с кассы",
        customer_phone: customerPhone.trim() || null,
        customer_email: customer?.email ?? null,
        delivery_date: deliveryDate,
        delivery_type: deliveryType,
        address: fulfillment === "courier" ? courierAddress.trim() : null,
        payment_method: paymentMethod,
        payment_status: "🟢 Оплачено",
        status: "confirmed",
        order_total: payable,
        goods_total: payable,
        used_points: redeemAmount || null,
        confirmed_at: now,
        raw_payload: { payment: { products, amount: String(payable), subtotal: String(payable) } },
      })
      .select("id")
      .single();

    if (insertErr || !order) {
      setError(insertErr?.message ?? "Не удалось создать заказ");
      setSubmitting(false);
      return;
    }

    // Заказ уже реален (продажа физически состоялась) — что бы ни
    // случилось с баллами дальше, список заказов должен обновиться сразу.
    onCreated();

    // Баллы — уже отдельно от самой продажи: если тут что-то не
    // получится (сеть, гонка баланса), заказ всё равно создан и букет
    // уже физически продан, откатывать его из-за этого нельзя. Ошибку
    // просто показываем — поправить баланс потом можно вручную на
    // странице "Клиенты".
    if (customer) {
      try {
        if (redeemAmount > 0) {
          const { error: redeemErr } = await supabase.from("points_transactions").insert({
            user_email: customer.email,
            amount: -redeemAmount,
            type: "redemption",
            order_id: orderId,
            description: "Списание на кассе",
          });
          if (redeemErr) throw redeemErr;
        }

        const { data: earnedRows } = await supabase
          .from("points_transactions")
          .select("amount")
          .ilike("user_email", customer.email)
          .gt("amount", 0);
        const totalEarnedSoFar = (earnedRows ?? []).reduce((sum, r) => sum + r.amount, 0);
        const earnedPoints = Math.floor((payable * getCashbackPercent(totalEarnedSoFar)) / 100);

        if (earnedPoints > 0) {
          const { error: accrualErr } = await supabase.from("points_transactions").insert({
            user_email: customer.email,
            amount: earnedPoints,
            type: "accrual",
            order_id: orderId,
            description: "Начисление за заказ на кассе",
          });
          if (accrualErr) throw accrualErr;
          await supabase.from("tilda_orders").update({ earned_points: earnedPoints }).eq("id", order.id);
        }
      } catch (e) {
        setError(e instanceof Error ? `Заказ создан, но баллы не начислены/списаны: ${e.message}` : "Заказ создан, но с баллами что-то пошло не так");
        setSubmitting(false);
        setOrderDone(true);
        return;
      }
    }

    onClose();
  }

  return (
    <Modal title="Новый заказ с кассы" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Клиент по карте (необязательно)</label>
          {customer ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{customer.customer_name || customer.email}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {customer.email}
                  {customer.customer_phone ? ` · ${customer.customer_phone}` : ""}
                </p>
                <p className="text-xs text-zinc-400">
                  Карта {customer.ma_id ?? "—"} · Баланс {customer.balance} б. · Заказов: {customer.orders_count}
                  {customer.last_order_at ? ` · последний ${formatDate(customer.last_order_at)}` : ""}
                </p>
              </div>
              <button onClick={detachCustomer} className="shrink-0 text-zinc-400 hover:text-red-500">
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupCustomer()}
                placeholder="Отсканируйте штрих-код карты или введите код"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={lookupCustomer}
                disabled={!scanCode.trim() || scanning}
                className="shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
              >
                {scanning ? "Ищем…" : "Найти"}
              </button>
            </div>
          )}
          {scanError && <p className="mt-1 text-xs text-red-500">{scanError}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Имя клиента (необязательно)"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Телефон (необязательно)"
            className="w-44 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            // Некоторые товары (охапки) продаются пачками — цена в
            // прайсе за пачку из order_unit_size стеблей, не за один.
            // "Кол-во" тут значит "сколько пачек", как и на сайте —
            // подписываем реальное число стеблей рядом, чтобы флорист
            // не подумал, что продал всего 1 цветок за 390 крон.
            const sticker = stickers.find((s) => s.id === row.stickerId);
            const packSize = sticker?.order_unit_size ?? 1;
            const realStems = (parseFloat(row.quantity) || 0) * packSize;
            return (
              <div key={row.key} className="flex items-center gap-2">
                <select
                  ref={(el) => {
                    rowRefs.current[row.key] = el;
                  }}
                  value={row.stickerId}
                  onChange={(e) => {
                    const s = stickers.find((s) => s.id === e.target.value);
                    updateRow(row.key, {
                      stickerId: e.target.value,
                      price: s?.price != null ? String(s.price) : row.price,
                    });
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    Товар…
                  </option>
                  {stickers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {decodeHtmlEntities(s.product_name)}
                      {s.order_unit_size > 1 ? ` (пачка ${s.order_unit_size} шт)` : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && isLast && row.stickerId && addRowAndFocus()}
                  placeholder="Кол-во"
                  className="w-20 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                />
                {packSize > 1 && <span className="shrink-0 whitespace-nowrap text-xs text-zinc-400">= {realStems} шт</span>}
                <input
                  type="number"
                  min={0}
                  value={row.price}
                  onChange={(e) => updateRow(row.key, { price: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && isLast && row.stickerId && addRowAndFocus()}
                  placeholder="Цена, Kč"
                  className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button onClick={() => removeRow(row.key)} disabled={rows.length === 1} className="text-zinc-400 hover:text-red-500 disabled:opacity-30">
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <button onClick={addRowAndFocus} className="text-sm font-medium text-accent">
          + Добавить позицию
        </button>

        {customer && customer.balance > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Списать баллов (макс {maxRedeem})</label>
            <input
              type="number"
              min={0}
              max={maxRedeem}
              value={redeemPoints}
              onChange={(e) => setRedeemPoints(e.target.value)}
              className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
        )}

        <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Получение</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "pickup_now", label: "Самовывоз сейчас" },
                { value: "pickup_later", label: "Самовывоз позже" },
                { value: "courier", label: "Доставка курьером" },
              ] as { value: FulfillmentMode; label: string }[]
            ).map((f) => (
              <button
                key={f.value}
                onClick={() => setFulfillment(f.value)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                  fulfillment === f.value
                    ? "bg-accent border-accent text-white"
                    : "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {fulfillment === "pickup_later" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {PICKUP_LATER_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPickupLaterAt(toDatetimeLocal(p.getDate()))}
                    className="rounded-full border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="datetime-local"
                value={pickupLaterAt}
                onChange={(e) => setPickupLaterAt(e.target.value)}
                className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
            </div>
          )}

          {fulfillment === "courier" && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={courierAddress}
                onChange={(e) => setCourierAddress(e.target.value)}
                placeholder="Адрес доставки (Praha, ул., дом)"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                type="datetime-local"
                value={courierAt}
                onChange={(e) => setCourierAt(e.target.value)}
                className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Оплата</p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPaymentMethod(m.value)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                  paymentMethod === m.value
                    ? "bg-accent border-accent text-white"
                    : "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {redeemAmount > 0 ? (
              <>
                Итого: <span className="line-through opacity-60">{total} Kč</span> −{redeemAmount} б. ={" "}
                <span className="font-semibold text-accent">{payable} Kč</span>
              </>
            ) : (
              <>Итого: {total} Kč</>
            )}
          </span>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Создаём…" : "Создать заказ"}
          </button>
        </div>
        {!paymentMethod && <p className="text-right text-xs text-zinc-400">Выбери способ оплаты выше</p>}

        {error && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            {orderDone && (
              <button onClick={onClose} className="shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm font-medium">
                Закрыть
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
