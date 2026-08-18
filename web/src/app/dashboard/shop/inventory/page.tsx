"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../../layout";
import { decodeHtmlEntities } from "@/lib/format";

type Product = {
  id: string;
  name: string;
  image_url: string | null;
  archived: boolean;
  quantity: number | null;
};

// Ниже этого остатка на сайте сама встаёт плашка "Zbývá N ks" — если
// менеджер не поставил свою плашку руками (та в приоритете).
const LOW_STOCK_THRESHOLD = 3;

function stockLabel(quantity: number | null) {
  if (quantity === null) return null;
  if (quantity === 0) return { text: "Vyprodáno", color: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-200 dark:ring-red-500/30" };
  if (quantity < LOW_STOCK_THRESHOLD) {
    return {
      text: `Zbývá ${quantity} ks`,
      color: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-orange-200 dark:ring-orange-500/30",
    };
  }
  return null;
}

function ProductRow({
  product: p,
  onSetQuantity,
  onAddDelivery,
}: {
  product: Product;
  onSetQuantity: (id: string, quantity: number) => void;
  onAddDelivery: (id: string, delta: number) => void;
}) {
  const [editValue, setEditValue] = useState(p.quantity ?? 0);
  const [editing, setEditing] = useState(false);
  const [deliveryValue, setDeliveryValue] = useState("");
  const badge = stockLabel(p.quantity);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-white dark:bg-zinc-900 p-2 ${
        badge ? "border-orange-300 dark:border-orange-500/40" : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{p.name}</p>
        {badge && <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${badge.color}`}>{badge.text}</span>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <input
          type="number"
          value={deliveryValue}
          onChange={(e) => setDeliveryValue(e.target.value)}
          placeholder="+шт"
          className="w-16 rounded-md border border-zinc-300 dark:border-zinc-600 px-1.5 py-1 text-xs text-zinc-700 dark:text-zinc-200"
        />
        <button
          type="button"
          onClick={() => {
            const n = parseInt(deliveryValue, 10);
            if (!Number.isFinite(n) || n === 0) return;
            onAddDelivery(p.id, n);
            setDeliveryValue("");
          }}
          className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white"
        >
          Přidat
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <>
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(parseInt(e.target.value, 10) || 0)}
              className="w-16 rounded-md border border-zinc-300 dark:border-zinc-600 px-1.5 py-1 text-xs text-zinc-700 dark:text-zinc-200"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                onSetQuantity(p.id, editValue);
                setEditing(false);
              }}
              className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300"
            >
              ✓
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditValue(p.quantity ?? 0);
              setEditing(true);
            }}
            className="w-14 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-center text-xs font-medium text-zinc-700 dark:text-zinc-200"
            title="Nastavit přesný počet"
          >
            {p.quantity === null ? "—" : p.quantity}
          </button>
        )}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  useDashboard();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("product_stickers")
      .select("id, product_name, image_url, archived, quantity")
      .eq("archived", false)
      .order("product_name", { ascending: true });
    setProducts(
      (data ?? [])
        .filter((p) => p.product_name && p.product_name !== "__default__")
        .map((p) => ({
          id: p.id,
          name: decodeHtmlEntities(p.product_name),
          image_url: p.image_url ?? null,
          archived: p.archived ?? false,
          quantity: p.quantity ?? null,
        })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setQuantity(productId: string, quantity: number) {
    const supabase = createClient();
    await supabase
      .from("product_stickers")
      .update({ quantity: Math.max(0, quantity) })
      .eq("id", productId);
    load();
  }

  async function addDelivery(productId: string, delta: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const next = Math.max(0, (product.quantity ?? 0) + delta);
    await setQuantity(productId, next);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
    // Товары с низким остатком — наверх, чтобы сразу бросались в глаза.
    return [...base].sort((a, b) => {
      const aLow = a.quantity !== null && a.quantity < LOW_STOCK_THRESHOLD;
      const bLow = b.quantity !== null && b.quantity < LOW_STOCK_THRESHOLD;
      if (aLow !== bLow) return aLow ? -1 : 1;
      if (aLow && bLow) return (a.quantity ?? 0) - (b.quantity ?? 0);
      return 0;
    });
  }, [products, search]);

  const lowStockCount = useMemo(
    () => products.filter((p) => p.quantity !== null && p.quantity < LOW_STOCK_THRESHOLD).length,
    [products],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <Link href="/dashboard/shop" className="text-xs text-zinc-500 dark:text-zinc-400 hover:underline">
            ← Магазин
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Наличие</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Когда остаётся меньше {LOW_STOCK_THRESHOLD} шт — на сайте сама появляется плашка «Zbývá N ks» (если вы не поставили свою плашку вручную в Магазине —
            своя всегда в приоритете).
          </p>
        </div>
        {lowStockCount > 0 && (
          <span className="shrink-0 rounded-full bg-orange-50 dark:bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-700 dark:text-orange-400 ring-1 ring-inset ring-orange-200 dark:ring-orange-500/30">
            Мало: {lowStockCount}
          </span>
        )}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по названию…"
        className="mb-3 w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
      />

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((p) => (
            <ProductRow key={p.id} product={p} onSetQuantity={setQuantity} onAddDelivery={addDelivery} />
          ))}
        </div>
      )}
    </div>
  );
}
