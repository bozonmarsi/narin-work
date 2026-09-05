"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BatchRow, Species } from "./types";

function freshness(wiltDate: string | null): { label: string; className: string } {
  if (!wiltDate) return { label: "—", className: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" };
  const days = Math.round((new Date(wiltDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Просрочено", className: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400" };
  if (days <= 2) return { label: `${days} дн.`, className: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { label: `${days} дн.`, className: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
}

export function StockTab() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [batchRes, spRes] = await Promise.all([
        supabase
          .from("batches")
          .select("id, species_id, remaining, purchase_date, estimated_wilt_date, photo_url")
          .gt("remaining", 0)
          .order("estimated_wilt_date", { ascending: true, nullsFirst: false }),
        supabase.from("species_reference").select("id, name, material_type, unit, default_vase_life_days"),
      ]);
      setBatches(batchRes.data ?? []);
      setSpecies(spRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  if (batches.length === 0) {
    return <p className="text-sm text-zinc-400">Остатков нет — все партии списаны или ещё не оприходованы.</p>;
  }

  const speciesById = new Map(species.map((s) => [s.id, s]));

  return (
    <div className="max-w-2xl space-y-2">
      {batches.map((b) => {
        const sp = speciesById.get(b.species_id);
        const f = freshness(b.estimated_wilt_date);
        return (
          <div key={b.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 p-3 text-sm">
            <div>
              <p className="font-medium">{sp?.name ?? "—"}</p>
              <p className="text-xs text-zinc-400">
                {b.remaining} {sp?.unit ?? ""} · с {new Date(b.purchase_date).toLocaleDateString("ru-RU")}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${f.className}`}>{f.label}</span>
          </div>
        );
      })}
    </div>
  );
}
