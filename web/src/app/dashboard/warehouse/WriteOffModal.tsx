"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "./Modal";

export const REASONS: { value: string; label: string }[] = [
  { value: "wilted", label: "Увял" },
  { value: "damaged", label: "Сломан" },
  { value: "defect", label: "Брак" },
  { value: "miscount", label: "Пересчёт" },
];

type BatchInfo = { id: string | null; remaining: number; productName: string; productStickerId: string };

// Фото не грузится в Supabase Storage — уходит менеджеру прямо в
// Telegram, здесь остаётся только file_id (см. миграцию writeoff_telegram_photo).
// batch.id может быть null — это остаток, который посчитан в
// product_stickers.quantity напрямую (например, руками поправили на
// странице Магазина) и никогда не проходил через приёмку партии. Чтобы
// списание всё равно легло в тот же журнал stock_movements, партия для
// него заводится прямо здесь, перед списанием.
export function WriteOffModal({ batch, onClose, onDone }: { batch: BatchInfo; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(REASONS[0].value);
  const [quantity, setQuantity] = useState(String(batch.remaining));
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = parseFloat(quantity);
  const canSubmit = qty > 0 && qty <= batch.remaining && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const reasonLabel = REASONS.find((r) => r.value === reason)?.label ?? reason;
    let telegramFileId: string | null = null;

    if (photo) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("photo", photo);
      form.append(
        "caption",
        `📉 Списание: ${batch.productName}, ${qty} шт, ${reasonLabel}${notes.trim() ? ` — ${notes.trim()}` : ""}`,
      );
      const res = await fetch("/api/warehouse/write-off-photo", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить фото в Telegram");
        setSubmitting(false);
        return;
      }
      telegramFileId = data.telegramFileId ?? null;
    }

    let batchId = batch.id;
    if (!batchId) {
      const { data: newBatch, error: batchErr } = await supabase
        .from("batches")
        .insert({ product_sticker_id: batch.productStickerId, quantity_received: batch.remaining, remaining: batch.remaining })
        .select("id")
        .single();
      if (batchErr || !newBatch) {
        setError(batchErr?.message ?? "Не удалось завести партию для списания");
        setSubmitting(false);
        return;
      }
      batchId = newBatch.id;
    }

    const { error: insertErr } = await supabase.from("write_offs").insert({
      batch_id: batchId,
      quantity: qty,
      reason,
      notes: notes.trim() || null,
      telegram_file_id: telegramFileId,
      created_by: user?.id,
    });

    if (insertErr) {
      setError(insertErr.message);
      setSubmitting(false);
      return;
    }

    onDone();
  }

  return (
    <Modal title={`Списать: ${batch.productName}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Причина</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Количество (в партии {batch.remaining} шт)
          </label>
          <input
            type="number"
            min={1}
            max={batch.remaining}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Комментарий (необязательно)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Фото (необязательно — уйдёт в Telegram менеджеру, у нас не хранится)
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="w-full text-xs"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "Списываем…" : "Списать"}
        </button>
      </div>
    </Modal>
  );
}
