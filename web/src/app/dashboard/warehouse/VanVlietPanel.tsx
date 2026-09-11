"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Поиск и заказ у Van Vliet (склад Praha) — вызывает Edge Functions
// vanvliet-search (только чтение) и vanvliet-order (реальная покупка).
//
// На сайте поставщика добавление в корзину необратимо — это не черновик,
// это готовое обязательство забрать и оплатить. Поэтому "Купить" всегда
// спрашивает подтверждение перед вызовом, и vanvliet-order сама требует
// confirm:true — сюда нельзя попасть случайно.

type SearchRow = { keyword: string; color: string; maxPrice: string; quantity: string };

type Candidate = {
  product: string;
  color: string;
  quality: string;
  price: number;
  stock: number;
  grower: string;
  photo: string;
  orderPer: number;
  cartProductKey: number;
  cartAmount: number;
};

type ResultGroup = {
  request: string;
  requestedQuantity: number | null;
  quantityWasUnspecified: boolean;
  candidates: Candidate[];
  date: string;
};

const COLOR_OPTIONS = ["White", "Pink", "Red", "Orange", "Yellow", "Purple", "Blue", "Green", "Creme", "Black"];

const emptyRow = (): SearchRow => ({ keyword: "", color: "", maxPrice: "", quantity: "" });

// Дата в пражском часовом поясе, +offsetDays дней от сегодня, как "YYYY-MM-DD".
function pragueDate(offsetDays: number): string {
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  const d = new Date(`${todayStr}T12:00:00`); // полдень — подальше от границ DST
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

const DATE_OPTIONS = [
  { label: "Сегодня", value: pragueDate(0) },
  { label: "Завтра", value: pragueDate(1) },
  { label: "Послезавтра", value: pragueDate(2) },
  { label: "Через 3 дня", value: pragueDate(3) },
];

// supabase-js only gives a generic "non-2xx status code" message by default —
// the actual error body (which step failed, what the supplier's API said) is
// on error.context (a Response). Without this we're debugging blind.
async function describeFunctionError(err: unknown): Promise<string> {
  const context = (err as { context?: Response })?.context;
  if (context && typeof context.text === "function") {
    try {
      const text = await context.text();
      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed);
      } catch {
        return text || String(err);
      }
    } catch {
      // fall through
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function VanVlietPanel() {
  const [rows, setRows] = useState<SearchRow[]>([emptyRow()]);
  const [targetDate, setTargetDate] = useState(DATE_OPTIONS[0].value);
  const [results, setResults] = useState<ResultGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<Record<string, boolean>>({});

  function updateRow(i: number, patch: Partial<SearchRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function search() {
    setError(null);
    setResults(null);

    const requests = rows
      .filter((r) => r.keyword.trim())
      .map((r) => ({
        label: r.keyword.trim(),
        keywords: r.keyword.trim().toLowerCase().split(/\s+/).filter(Boolean),
        colors: r.color ? [r.color] : [],
        maxPrice: r.maxPrice ? Number(r.maxPrice) : null,
        quantity: r.quantity ? Number(r.quantity) : null,
      }));

    if (!requests.length) {
      setError("Добавь хотя бы одну позицию");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("vanvliet-search", {
        body: { requests, targetDate },
      });

      if (fnError) throw fnError;
      if (data?.ok === false) {
        throw new Error(data.step ? `${data.step}: ${JSON.stringify(data.body)}` : data.error);
      }

      setResults(data.results);
    } catch (e) {
      setError(await describeFunctionError(e));
    } finally {
      setLoading(false);
    }
  }

  async function buy(candidate: Candidate, requestLabel: string, date: string) {
    const key = `${requestLabel}:${candidate.cartProductKey}`;
    const total = candidate.price * candidate.cartAmount;
    if (
      !confirm(
        `Заказать «${candidate.product}» — ${candidate.cartAmount} шт за ${total} Kč на ${date}?\n\nЭто реальная покупка у поставщика, отменить нельзя.`
      )
    ) {
      return;
    }

    setOrdering(key);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("vanvliet-order", {
        body: { cartProductKey: candidate.cartProductKey, cartAmount: candidate.cartAmount, targetDate: date, confirm: true },
      });
      if (fnError) throw fnError;
      if (data?.ok === false) throw new Error(JSON.stringify(data.body || data.error));
      setOrdered((p) => ({ ...p, [key]: true }));
    } catch (e) {
      alert("Не удалось заказать: " + (await describeFunctionError(e)));
    } finally {
      setOrdering(null);
    }
  }

  return (
    <div className="mb-4 space-y-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
      <p className="text-sm font-medium">Van Vliet — поиск и заказ (Praha)</p>

      <div className="flex flex-wrap gap-1.5">
        {DATE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTargetDate(opt.value)}
            className={`rounded-md border px-2 py-1 text-xs ${
              targetDate === opt.value
                ? "border-accent bg-accent text-white"
                : "border-zinc-300 text-zinc-600 hover:border-accent dark:border-zinc-600 dark:text-zinc-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <input
              value={row.keyword}
              onChange={(e) => updateRow(i, { keyword: e.target.value })}
              placeholder="Что нужно (напр. hortenz)"
              className="w-36 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            />
            <select
              value={row.color}
              onChange={(e) => updateRow(i, { color: e.target.value })}
              className="rounded-md border border-zinc-300 bg-transparent px-1 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            >
              <option value="">любой цвет</option>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={row.maxPrice}
              onChange={(e) => updateRow(i, { maxPrice: e.target.value })}
              placeholder="до Kč"
              type="number"
              className="w-16 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            />
            <input
              value={row.quantity}
              onChange={(e) => updateRow(i, { quantity: e.target.value })}
              placeholder="шт"
              type="number"
              className="w-14 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            />
            {rows.length > 1 && (
              <button onClick={() => removeRow(i)} className="text-xs text-zinc-400 hover:text-red-500">
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={addRow} className="text-xs text-accent hover:underline">
            + ещё позиция
          </button>
          <button
            onClick={search}
            disabled={loading}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {loading ? "Ищу…" : "Искать"}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {results && (
        <div className="space-y-3">
          {results.map((group) => (
            <div key={group.request}>
              <p className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {group.request}
                {group.quantityWasUnspecified && <span className="text-zinc-400"> (количество не указано)</span>}
              </p>
              {group.candidates.length === 0 ? (
                <p className="text-xs text-zinc-400">Ничего не найдено</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {group.candidates.map((c) => {
                    const key = `${group.request}:${c.cartProductKey}`;
                    return (
                      <div key={key} className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
                        {c.photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.photo} alt={c.product} className="mb-1 h-20 w-full rounded object-cover" />
                        )}
                        <p className="font-medium leading-tight">{c.product}</p>
                        <p className="text-zinc-500 dark:text-zinc-400">
                          {c.color} · {c.quality} · {c.grower || "—"}
                        </p>
                        <p className="mt-1">
                          {c.price} Kč × {c.cartAmount} = <b>{c.price * c.cartAmount} Kč</b>
                        </p>
                        <p className="text-zinc-400">на складе: {c.stock}</p>
                        <button
                          onClick={() => buy(c, group.request, group.date)}
                          disabled={ordering === key || ordered[key]}
                          className="mt-1.5 w-full rounded-md bg-accent px-2 py-1 text-white disabled:opacity-50"
                        >
                          {ordered[key] ? "Заказано ✓" : ordering === key ? "…" : "Купить"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
