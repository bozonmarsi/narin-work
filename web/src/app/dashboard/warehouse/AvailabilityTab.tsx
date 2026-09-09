"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";
import { freshness } from "@/lib/freshness";
import { WriteOffModal } from "./WriteOffModal";

type Product = { id: string; product_name: string; image_url: string | null; quantity: number | null };
type BatchLite = { id: string; product_sticker_id: string; remaining: number; purchase_date: string; estimated_wilt_date: string | null };

// Отдельная от Каталога вкладка: только сырьё на партиях (охапки), и
// только оперативная картина — сколько осталось и насколько свежее.
// Редактирование цены/фото/состава — в Каталоге, здесь не трогаем.
export function AvailabilityTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<BatchLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [writeOffBatch, setWriteOffBatch] = useState<{ id: string; remaining: number; productName: string } | null>(null);

  async function load() {
    const supabase = createClient();
    const [productsRes, batchesRes] = await Promise.all([
      supabase
        .from("product_stickers")
        .select("id, product_name, image_url, quantity")
        .eq("category", "ohapka")
        .eq("archived", false)
        .order("product_name"),
      supabase.from("batches").select("id, product_sticker_id, remaining, purchase_date, estimated_wilt_date").gt("remaining", 0),
    ]);
    setProducts(productsRes.data ?? []);
    setBatches((batchesRes.data ?? []).sort((a, b) => a.purchase_date.localeCompare(b.purchase_date)));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  // Заканчивается — впереди, чтобы сразу бросалось в глаза.
  const sorted = [...products].sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));

  return (
    <div className="space-y-2">
      {sorted.map((p) => {
        const name = decodeHtmlEntities(p.product_name);
        const productBatches = batches.filter((b) => b.product_sticker_id === p.id);
        const out = (p.quantity ?? 0) <= 0;

        return (
          <div key={p.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3">
            <div className="flex items-center gap-2">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className={`text-xs ${out ? "font-medium text-red-500" : "text-zinc-400"}`}>
                  {out ? "Закончилось" : `${p.quantity} стеблей на складе`}
                </p>
              </div>
            </div>

            {productBatches.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                {productBatches.map((b) => {
                  const f = freshness(b.estimated_wilt_date);
                  const ageDays = Math.floor((Date.now() - new Date(b.purchase_date).getTime()) / 86400000);
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-2">
                      <span
                        title={`Партия от ${new Date(b.purchase_date).toLocaleDateString("ru-RU")}`}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${f.className}`}
                      >
                        {b.remaining} шт · {ageDays === 0 ? "сегодня" : `${ageDays} дн. на складе`} · св. {f.label}
                      </span>
                      <button
                        onClick={() => setWriteOffBatch({ id: b.id, remaining: b.remaining, productName: name })}
                        className="shrink-0 text-[11px] text-zinc-400 hover:text-red-500"
                      >
                        Списать
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {sorted.length === 0 && <p className="text-sm text-zinc-400">Нет сырья на учёте.</p>}

      {writeOffBatch && (
        <WriteOffModal
          batch={writeOffBatch}
          onClose={() => setWriteOffBatch(null)}
          onDone={() => {
            setWriteOffBatch(null);
            load();
          }}
        />
      )}
    </div>
  );
}
