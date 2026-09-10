"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { decodeHtmlEntities } from "@/lib/format";
import { Modal } from "./Modal";
import type { RawMaterial, Supplier } from "./types";

type DraftItem = {
  supplier_item_name: string;
  quantity: number;
  unit_price: number | null;
  matched_product_sticker_id: string | null;
};

export type InvoiceDraft = {
  id: string;
  supplier_name: string | null;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  drive_url: string | null;
  items: DraftItem[];
};

type Row = { key: string; supplierItemName: string; productStickerId: string; quantity: string; price: string; skip: boolean };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Флорист подтверждает то, что распознал n8n/Claude из письма с
// фактурой — партия на склад заводится тем же путём, что и в обычной
// Приёмке (батч + stock_movement), только после явного клика "Принять",
// никогда автоматически, чтобы ошибка распознавания не испортила остаток.
export function InvoiceDraftModal({
  draft,
  suppliers,
  materials,
  onClose,
  onDone,
}: {
  draft: InvoiceDraft;
  suppliers: Supplier[];
  materials: RawMaterial[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useDashboard();
  const [supplierId, setSupplierId] = useState<string | null>(
    draft.supplier_id ?? suppliers.find((s) => s.name.toLowerCase() === (draft.supplier_name ?? "").toLowerCase())?.id ?? null,
  );
  const [purchaseDate, setPurchaseDate] = useState(draft.invoice_date ?? todayStr());
  const [rows, setRows] = useState<Row[]>(
    draft.items.map((it) => ({
      key: crypto.randomUUID(),
      supplierItemName: it.supplier_item_name,
      productStickerId: it.matched_product_sticker_id ?? "",
      quantity: String(it.quantity),
      price: it.unit_price != null ? String(it.unit_price) : "",
      skip: false,
    })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const activeRows = rows.filter((r) => !r.skip && r.productStickerId && parseFloat(r.quantity) > 0);
  const canConfirm = !!supplierId && activeRows.length > 0 && !submitting && !rejecting;

  async function confirm() {
    if (!canConfirm || !supplierId) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    try {
      for (const row of activeRows) {
        const material = materials.find((m) => m.id === row.productStickerId);
        const qty = parseFloat(row.quantity);
        const wiltDate =
          material?.default_vase_life_days != null
            ? new Date(new Date(purchaseDate).getTime() + material.default_vase_life_days * 86400000).toISOString().slice(0, 10)
            : null;

        const { data: batch, error: batchErr } = await supabase
          .from("batches")
          .insert({
            product_sticker_id: row.productStickerId,
            supplier_id: supplierId,
            quantity_received: qty,
            remaining: 0,
            purchase_price_per_unit: row.price ? parseFloat(row.price) : null,
            purchase_date: purchaseDate,
            estimated_wilt_date: wiltDate,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (batchErr || !batch) throw new Error(batchErr?.message ?? "Не удалось создать партию");

        const { error: moveErr } = await supabase.from("stock_movements").insert({
          batch_id: batch.id,
          change_qty: qty,
          reason: "received",
          created_by: user.id,
        });
        if (moveErr) throw new Error(moveErr.message);
      }

      const { error: updErr } = await supabase
        .from("invoice_drafts")
        .update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() })
        .eq("id", draft.id);
      if (updErr) throw new Error(updErr.message);

      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
      setSubmitting(false);
    }
  }

  async function reject() {
    setRejecting(true);
    setError(null);
    const supabase = createClient();
    const { error: updErr } = await supabase.from("invoice_drafts").update({ status: "rejected" }).eq("id", draft.id);
    if (updErr) {
      setError(updErr.message);
      setRejecting(false);
      return;
    }
    onDone();
  }

  return (
    <Modal title={`Фактура${draft.invoice_number ? ` №${draft.invoice_number}` : ""}`} onClose={onClose} wide>
      <div className="space-y-4">
        {draft.drive_url && (
          <a href={draft.drive_url} target="_blank" rel="noreferrer" className="text-sm text-accent underline">
            Открыть скан фактуры →
          </a>
        )}

        <div className="flex flex-wrap gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Поставщик</p>
            <select
              value={supplierId ?? ""}
              onChange={(e) => setSupplierId(e.target.value || null)}
              className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="" disabled>
                {draft.supplier_name ? `${draft.supplier_name} (не сопоставлен)` : "Выбери поставщика…"}
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Дата поставки</p>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Позиции — то, что распознала фактура, поправь при необходимости</p>
          {rows.map((row) => (
            <div key={row.key} className={`flex items-center gap-2 ${row.skip ? "opacity-40" : ""}`}>
              <div className="min-w-0 flex-1">
                <select
                  value={row.productStickerId}
                  onChange={(e) => updateRow(row.key, { productStickerId: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">Не сопоставлено — выбери товар…</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {decodeHtmlEntities(m.product_name)}
                    </option>
                  ))}
                </select>
                <p className="mt-0.5 truncate text-[11px] text-zinc-400">в фактуре: {row.supplierItemName}</p>
              </div>
              <input
                type="number"
                min={0}
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                placeholder="Кол-во"
                className="w-20 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                type="number"
                min={0}
                value={row.price}
                onChange={(e) => updateRow(row.key, { price: e.target.value })}
                placeholder="Цена/ед."
                className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={() => updateRow(row.key, { skip: !row.skip })}
                title={row.skip ? "Вернуть позицию" : "Не принимать эту позицию"}
                className="shrink-0 text-zinc-400 hover:text-red-500"
              >
                {row.skip ? "↺" : "✕"}
              </button>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <button
            onClick={reject}
            disabled={submitting || rejecting}
            className="rounded-xl border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 disabled:opacity-40"
          >
            {rejecting ? "Отклоняем…" : "Отклонить фактуру"}
          </button>
          <button
            onClick={confirm}
            disabled={!canConfirm}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Принимаем…" : "Принять на склад"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
