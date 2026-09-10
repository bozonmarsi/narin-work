"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";
import type { RawMaterial, Supplier } from "./types";

type Alias = { id: string; supplier_id: string | null; alias: string; product_sticker_id: string };

// Словарь "как поставщик называет товар" → "какой это наш товар" —
// флорист ведёт его сам, здесь и только здесь. Ничего из этого не
// попадает ни в один клиентский экран — это чисто внутренняя шпаргалка
// для распознавания фактур.
export function AliasesTab() {
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const [newSupplierId, setNewSupplierId] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newProductId, setNewProductId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    const [aliasesRes, suppliersRes, materialsRes] = await Promise.all([
      supabase.from("product_name_aliases").select("id, supplier_id, alias, product_sticker_id").order("alias"),
      supabase.from("suppliers").select("id, name, contact_phone, contact_email").order("name"),
      supabase
        .from("product_stickers")
        .select("id, product_name, material_type, unit, default_vase_life_days, order_unit_size")
        .eq("category", "ohapka")
        .order("product_name"),
    ]);
    setAliases(aliasesRes.data ?? []);
    setSuppliers(suppliersRes.data ?? []);
    setMaterials(materialsRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addAlias() {
    const alias = newAlias.trim();
    if (!alias || !newProductId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: insertErr } = await supabase.from("product_name_aliases").insert({
      supplier_id: newSupplierId || null,
      alias,
      product_sticker_id: newProductId,
    });
    setSaving(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setNewAlias("");
    setNewProductId("");
    load();
  }

  async function removeAlias(id: string) {
    const supabase = createClient();
    await supabase.from("product_name_aliases").delete().eq("id", id);
    load();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-xs text-zinc-400">
        Как поставщик называет товар в фактуре → какой это товар у нас. Используется для автоматического распознавания
        фактур — никуда больше (заказы, каталог) не попадает.
      </p>

      <div className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3">
        <p className="text-sm font-semibold">Новое соответствие</p>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            1. Поставщик, у которого так называется (необязательно)
          </label>
          <select
            value={newSupplierId}
            onChange={(e) => setNewSupplierId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">Любой поставщик</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            2. Как это название написано в фактуре — скопируй как есть
          </label>
          <input
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            placeholder="например: Paeonia l bowl of cream 55cm"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">3. Какой это товар у нас в каталоге</label>
          <select
            value={newProductId}
            onChange={(e) => setNewProductId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="" disabled>
              Выбери товар…
            </option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {decodeHtmlEntities(m.product_name)}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={addAlias}
          disabled={!newAlias.trim() || !newProductId || saving}
          className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Сохраняем…" : "Запомнить соответствие"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="space-y-1.5">
        {aliases.map((a) => {
          const supplier = suppliers.find((s) => s.id === a.supplier_id);
          const product = materials.find((m) => m.id === a.product_sticker_id);
          return (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">
                  <span className="text-zinc-400">{supplier?.name ?? "Любой поставщик"}:</span> «{a.alias}» →{" "}
                  <span className="font-medium">{product ? decodeHtmlEntities(product.product_name) : "—"}</span>
                </p>
              </div>
              <button onClick={() => removeAlias(a.id)} className="shrink-0 text-zinc-400 hover:text-red-500">
                ✕
              </button>
            </div>
          );
        })}
        {aliases.length === 0 && <p className="text-sm text-zinc-400">Соответствий ещё нет.</p>}
      </div>
    </div>
  );
}
