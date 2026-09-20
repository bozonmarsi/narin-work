"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { formatDate } from "@/lib/format";
import { isPickupOrder } from "@/lib/order-status";

type Expense = {
  id: string;
  occurred_at: string;
  amount: number;
  category: string;
  subcategory: string | null;
  counterparty: string | null;
  document_ref: string | null;
  description: string | null;
  receipt_url: string | null;
};

type CashOrder = {
  order_id: string | null;
  order_total: number | null;
  delivery_type: string | null;
};

function todayBoundsISO() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

const CATEGORY_SUGGESTIONS = ["Машина", "Реклама", "Офис", "Прочие"];
const SUBCATEGORY_SUGGESTIONS = ["Упаковка", "Офис", "Реклама", "Зарплата"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Общие расходы бизнеса, не завязанные на закупку цветов (та таблица —
// склад/Приёмка) — аренда, зарплата, упаковка, реклама, офис. Раньше
// велось в отдельном Google Sheets, теперь тут же, где всё остальное, и
// автоматически попадает в accounting_ledger.
export default function ExpensesPage() {
  const { profile } = useDashboard();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashToday, setCashToday] = useState<CashOrder[]>([]);

  const [occurredAt, setOccurredAt] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("business_expenses")
      .select("id, occurred_at, amount, category, subcategory, counterparty, document_ref, description, receipt_url")
      .order("occurred_at", { ascending: false })
      .limit(100);
    setExpenses(data ?? []);
    setLoading(false);
  }

  // Наличные, которые сейчас реально должны лежать у флориста: заказы,
  // забранные лично (самовывоз, включая продажи с кассы) и оплаченные
  // наличными. Курьерские заказы сюда не попадают — там наличные у
  // курьера, не в кассе магазина.
  async function loadCashToday() {
    const { startISO, endISO } = todayBoundsISO();
    const supabase = createClient();
    const { data } = await supabase
      .from("tilda_orders")
      .select("order_id, order_total, delivery_type")
      .eq("payment_method", "cash")
      .eq("payment_status", "🟢 Оплачено")
      .gte("created_at", startISO)
      .lt("created_at", endISO);
    setCashToday((data ?? []).filter((o) => isPickupOrder(o.delivery_type)));
  }

  useEffect(() => {
    load();
    loadCashToday();
  }, []);

  function resetForm() {
    setOccurredAt(todayStr());
    setAmount("");
    setCategory("");
    setSubcategory("");
    setCounterparty("");
    setDocumentRef("");
    setDescription("");
    setReceiptUrl(null);
  }

  async function addExpense() {
    const value = parseFloat(amount);
    if (!(value > 0) || !category.trim() || !description.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertErr } = await supabase.from("business_expenses").insert({
      occurred_at: occurredAt,
      amount: value,
      category: category.trim(),
      subcategory: subcategory.trim() || null,
      counterparty: counterparty.trim() || null,
      document_ref: documentRef.trim() || null,
      description: description.trim(),
      receipt_url: receiptUrl,
      created_by: user?.id,
    });

    setSaving(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    resetForm();
    load();
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
  }

  // Фото/скан чека (аренда, реклама, бензин — что угодно, не цветы) —
  // Claude разбирает его тем же путём, что и фактуры в Приёмке, но
  // здесь ничего не пишется в базу сама функция: просто подставляет
  // сумму/дату/контрагента/описание в форму ниже, а сохраняет расход
  // сам менеджер явным кликом "Добавить расход", как обычно.
  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    setReceiptUploading(true);
    setReceiptError(null);
    const supabase = createClient();
    try {
      const ext = file.name.split(".").pop() ?? (file.type === "application/pdf" ? "pdf" : "jpg");
      const path = `expenses/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("warehouse-photos").upload(path, file, { contentType: file.type });
      if (uploadErr) throw new Error(uploadErr.message);
      const uploadedUrl = supabase.storage.from("warehouse-photos").getPublicUrl(path).data.publicUrl;

      const fileBase64 = await fileToBase64(file);
      const { data, error: fnErr } = await supabase.functions.invoke("invoice-ingest", {
        body: { file_base64: fileBase64, mime_type: file.type, mode: "extract" },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.ok === false) throw new Error(data.error ?? "Не удалось разобрать чек");

      const parsed = data?.parsed as
        | { invoice_date: string | null; vendor: string | null; total_amount: number | null; invoice_number: string | null; items: { name: string }[] }
        | undefined;
      if (parsed) {
        if (parsed.invoice_date) setOccurredAt(parsed.invoice_date);
        if (parsed.total_amount != null) setAmount(String(parsed.total_amount));
        if (parsed.vendor) setCounterparty(parsed.vendor);
        if (parsed.invoice_number) setDocumentRef(parsed.invoice_number);
        const itemNames = (parsed.items ?? []).map((it) => it.name).join(", ");
        setDescription(itemNames || parsed.vendor || "");
      }
      setReceiptUrl(uploadedUrl);
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setReceiptUploading(false);
    }
  }

  async function removeExpense(id: string) {
    const supabase = createClient();
    await supabase.from("business_expenses").delete().eq("id", id);
    load();
  }

  if (profile?.role !== "manager") {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Доступно только менеджеру.</p>;
  }

  const canAdd = parseFloat(amount) > 0 && !!category.trim() && !!description.trim() && !saving;
  const cashTotal = cashToday.reduce((sum, o) => sum + (o.order_total ?? 0), 0);
  const kassaCount = cashToday.filter((o) => (o.order_id ?? "").startsWith("KASSA-")).length;
  const pickupCount = cashToday.length - kassaCount;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Расходы</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Общие траты бизнеса — аренда, зарплата, упаковка, реклама, офис. Закупка цветов сюда не пишется — она уже
        учитывается через Приёмку на складе.
      </p>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <p className="text-sm font-semibold">Касса сегодня</p>
        <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
          Наличные, которые сейчас должны быть у флориста: самовывоз + продажи с кассы, оплаченные наличными.
          Курьерские заказы сюда не входят — там деньги у курьера.
        </p>
        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{cashTotal} Kč</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {pickupCount} самовывозом · {kassaCount} с кассы
        </p>
        {cashToday.length > 0 && (
          <details className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            <summary className="cursor-pointer">Список ({cashToday.length})</summary>
            <div className="mt-1.5 space-y-1">
              {cashToday.map((o) => (
                <div key={o.order_id} className="flex items-center justify-between">
                  <span>
                    {o.order_id}
                    {(o.order_id ?? "").startsWith("KASSA-") ? " · касса" : " · самовывоз"}
                  </span>
                  <span className="font-medium">{o.order_total} Kč</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Новый расход</p>
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-accent/40 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5">
            {receiptUploading ? "Распознаём…" : "📷 Загрузить чек / фото"}
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={handleReceiptUpload}
              disabled={receiptUploading}
              className="hidden"
            />
          </label>
        </div>
        {receiptError && <p className="text-xs text-red-600 dark:text-red-400">{receiptError}</p>}
        {receiptUrl && (
          <a href={receiptUrl} target="_blank" rel="noreferrer" className="block text-xs text-accent underline">
            Открыть загруженный чек →
          </a>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Дата</label>
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Сумма, Kč</label>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Категория</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="expense-categories"
              placeholder="например: Машина"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <datalist id="expense-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Подкатегория</label>
            <input
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              list="expense-subcategories"
              placeholder="необязательно"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <datalist id="expense-subcategories">
              {SUBCATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Описание — на что потрачено</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="например: Аренда машины (неделя 21)"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Контрагент (необязательно)</label>
            <input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Номер документа (необязательно)</label>
            <input
              value={documentRef}
              onChange={(e) => setDocumentRef(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        <button
          onClick={addExpense}
          disabled={!canAdd}
          className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto sm:px-8"
        >
          {saving ? "Сохраняем…" : "Добавить расход"}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>
      ) : (
        <div className="space-y-1.5">
          {expenses.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="font-medium">{e.description}</span>
                  {e.counterparty && <span className="text-zinc-400"> · {e.counterparty}</span>}
                </p>
                <p className="text-xs text-zinc-400">
                  {formatDate(e.occurred_at)} · {e.category}
                  {e.subcategory ? ` / ${e.subcategory}` : ""}
                  {e.document_ref ? ` · №${e.document_ref}` : ""}
                  {e.receipt_url && (
                    <>
                      {" · "}
                      <a href={e.receipt_url} target="_blank" rel="noreferrer" className="text-accent underline">
                        чек
                      </a>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-semibold text-red-500">−{e.amount} Kč</span>
                <button onClick={() => removeExpense(e.id)} className="text-zinc-400 hover:text-red-500">
                  ✕
                </button>
              </div>
            </div>
          ))}
          {expenses.length === 0 && <p className="text-sm text-zinc-400">Расходов ещё нет.</p>}
        </div>
      )}
    </div>
  );
}
