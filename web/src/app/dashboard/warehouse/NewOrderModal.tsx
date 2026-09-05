"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";
import { Modal } from "./Modal";

type Sticker = { id: string; product_name: string };
type Row = { key: string; stickerId: string; quantity: string; price: string };

function newRow(): Row {
  return { key: crypto.randomUUID(), stickerId: "", quantity: "1", price: "" };
}

// Заказ "с кассы" — клиент стоит перед флористом, платит сразу и
// забирает букет на месте. Заводится сразу в статусе "Подтверждён",
// поэтому дальше проходит через ту же сборку, что и обычные заказы
// с сайта — отдельного пути списания для него нет.
export function NewOrderModal({ stickers, onClose, onCreated }: { stickers: Sticker[]; onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLSelectElement | null>>({});

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

  const validRows = rows.filter((r) => r.stickerId && parseFloat(r.quantity) > 0);
  const total = validRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0) * (parseFloat(r.price) || 0), 0);
  const canSubmit = validRows.length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    const products = validRows.map((r) => {
      const sticker = stickers.find((s) => s.id === r.stickerId);
      const qty = parseFloat(r.quantity);
      const price = parseFloat(r.price) || 0;
      return { name: sticker?.product_name ?? "", price: String(price), quantity: qty };
    });

    const today = new Date().toISOString();
    const { error: insertErr } = await supabase.from("tilda_orders").insert({
      customer_name: customerName.trim() || "Клиент с кассы",
      recipient_name: customerName.trim() || "Клиент с кассы",
      customer_phone: customerPhone.trim() || null,
      delivery_date: today,
      delivery_type: "Servisní poplatek = 80",
      payment_status: "🟢 Оплачено",
      status: "confirmed",
      order_total: total,
      goods_total: total,
      confirmed_at: today,
      raw_payload: { payment: { products, amount: String(total), subtotal: String(total) } },
    });

    if (insertErr) {
      setError(insertErr.message);
      setSubmitting(false);
      return;
    }

    onCreated();
    onClose();
  }

  return (
    <Modal title="Новый заказ с кассы" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <input
            autoFocus
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
            return (
              <div key={row.key} className="flex items-center gap-2">
                <select
                  ref={(el) => {
                    rowRefs.current[row.key] = el;
                  }}
                  value={row.stickerId}
                  onChange={(e) => updateRow(row.key, { stickerId: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    Товар…
                  </option>
                  {stickers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {decodeHtmlEntities(s.product_name)}
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

        <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Итого: {total} Kč</span>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Создаём…" : "Создать заказ"}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
