"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";

type Material = { id: string; product_name: string; quantity: number | null; unit: string | null };
type BatchLite = { product_sticker_id: string; remaining: number; estimated_wilt_date: string | null };

function freshness(wiltDate: string | null): { label: string; className: string } {
  if (!wiltDate) return { label: "нет партии", className: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" };
  const days = Math.round((new Date(wiltDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Просрочено", className: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400" };
  if (days <= 2) return { label: `${days} дн.`, className: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { label: `${days} дн.`, className: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
}

export function StockTab() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [batches, setBatches] = useState<BatchLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [matRes, batchRes] = await Promise.all([
        supabase.from("product_stickers").select("id, product_name, quantity, unit").eq("category", "ohapka").order("product_name"),
        supabase.from("batches").select("product_sticker_id, remaining, estimated_wilt_date").gt("remaining", 0),
      ]);
      setMaterials(matRes.data ?? []);
      setBatches(batchRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  if (materials.length === 0) {
    return <p className="text-sm text-zinc-400">В каталоге пока нет ни одного товара с категорией "ohapka".</p>;
  }

  // Наличие (product_stickers.quantity) — главное число, оно всегда
  // актуально, даже если по товару ещё ни разу не проводили приёмку
  // через склад (например, старое количество, заведённое вручную на
  // "Магазине"). Партии добавляют только свежесть — самую близкую дату
  // увядания среди всех партий этого товара.
  const soonestWiltByMaterial = new Map<string, string | null>();
  for (const b of batches) {
    const current = soonestWiltByMaterial.get(b.product_sticker_id);
    if (b.estimated_wilt_date && (!current || b.estimated_wilt_date < current)) {
      soonestWiltByMaterial.set(b.product_sticker_id, b.estimated_wilt_date);
    } else if (!soonestWiltByMaterial.has(b.product_sticker_id)) {
      soonestWiltByMaterial.set(b.product_sticker_id, b.estimated_wilt_date ?? null);
    }
  }

  return (
    <div className="max-w-2xl space-y-2">
      {materials.map((m) => {
        const f = freshness(soonestWiltByMaterial.get(m.id) ?? null);
        return (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 p-3 text-sm">
            <div>
              <p className="font-medium">{decodeHtmlEntities(m.product_name)}</p>
              <p className="text-xs text-zinc-400">
                {m.quantity ?? 0} {m.unit ?? "шт"}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${f.className}`}>{f.label}</span>
          </div>
        );
      })}
    </div>
  );
}
