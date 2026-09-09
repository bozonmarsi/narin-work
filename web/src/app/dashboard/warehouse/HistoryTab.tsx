"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities, formatDateTime } from "@/lib/format";
import { REASONS } from "./WriteOffModal";

type BatchRow = {
  id: string;
  product_sticker_id: string;
  supplier_id: string | null;
  quantity_received: number;
  purchase_price_per_unit: number | null;
  created_at: string;
};
type WriteOffRow = {
  id: string;
  batch_id: string;
  quantity: number;
  reason: string;
  notes: string | null;
  telegram_file_id: string | null;
  created_at: string;
};
type StickerLite = { id: string; product_name: string };
type SupplierLite = { id: string; name: string };

function reasonLabel(value: string) {
  return REASONS.find((r) => r.value === value)?.label ?? value;
}

// История приёмок и списаний — спрятана внутри "Приёмки" за отдельным
// переключателем, чтобы не занимать место на основном экране, но была
// под рукой, когда нужно свериться, что и когда приходило/списывалось.
export function HistoryTab() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [writeOffs, setWriteOffs] = useState<WriteOffRow[]>([]);
  const [stickers, setStickers] = useState<StickerLite[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("batches")
        .select("id, product_sticker_id, supplier_id, quantity_received, purchase_price_per_unit, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("write_offs")
        .select("id, batch_id, quantity, reason, notes, telegram_file_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("product_stickers").select("id, product_name"),
      supabase.from("suppliers").select("id, name"),
    ]).then(([batchesRes, writeOffsRes, stickersRes, suppliersRes]) => {
      setBatches(batchesRes.data ?? []);
      setWriteOffs(writeOffsRes.data ?? []);
      setStickers(stickersRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  const batchProductName = (b: BatchRow) => decodeHtmlEntities(stickers.find((s) => s.id === b.product_sticker_id)?.product_name ?? "—");
  const writeOffProductName = (w: WriteOffRow) => {
    const batch = batches.find((b) => b.id === w.batch_id);
    return batch ? batchProductName(batch) : "—";
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Приход</h3>
        <div className="space-y-1.5">
          {batches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{batchProductName(b)}</p>
                <p className="truncate text-xs text-zinc-400">
                  {suppliers.find((s) => s.id === b.supplier_id)?.name ?? "—"} · {formatDateTime(b.created_at)}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">+{b.quantity_received} шт</p>
                {b.purchase_price_per_unit != null && <p className="text-zinc-400">{b.purchase_price_per_unit} Kč/шт</p>}
              </div>
            </div>
          ))}
          {batches.length === 0 && <p className="text-sm text-zinc-400">Приходов ещё не было.</p>}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Списания</h3>
        <div className="space-y-1.5">
          {writeOffs.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{writeOffProductName(w)}</p>
                <p className="truncate text-xs text-zinc-400">
                  {reasonLabel(w.reason)}
                  {w.notes ? ` — ${w.notes}` : ""} · {formatDateTime(w.created_at)}
                  {w.telegram_file_id ? " · 📷" : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-red-500">−{w.quantity} шт</p>
            </div>
          ))}
          {writeOffs.length === 0 && <p className="text-sm text-zinc-400">Списаний ещё не было.</p>}
        </div>
      </div>
    </div>
  );
}
