"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { decodeHtmlEntities } from "@/lib/format";
import { Modal } from "./Modal";

type OrderLite = {
  id: string;
  order_id: string | null;
  customer_name: string | null;
  recipient_name: string | null;
  products_text: string | null;
  raw_payload: { payment?: { products?: { name?: string; quantity?: number }[] } } | null;
};

type StickerLite = { id: string; product_name: string; category: string | null; unit: string | null; order_unit_size: number };
type RecipeLite = { bouquet_sticker_id: string; ingredient_sticker_id: string; quantity_needed: number };
type BatchLite = { id: string; product_sticker_id: string; remaining: number; purchase_date: string };
type BatchAlloc = { batchId: string; available: number; purchaseDate: string; take: string };
type NeedRow = { ingredientId: string; ingredientName: string; unit: string | null; neededQty: number; batches: BatchAlloc[] };

function parseLineItems(order: OrderLite): { name: string; rawName: string; quantity: number }[] {
  const items = order.raw_payload?.payment?.products;
  if (items && items.length > 0) {
    return items.map((p) => ({
      rawName: p.name ?? "",
      name: decodeHtmlEntities(p.name ?? ""),
      quantity: Number(p.quantity ?? 1),
    }));
  }
  return (order.products_text ?? "")
    .split("\n")
    .map((line) => {
      const m = line.match(/^(.*?)\s*x\s*(\d+)\s*$/i);
      if (!m) return { name: line.trim(), rawName: line.trim(), quantity: 1 };
      return { name: m[1].trim(), rawName: m[1].trim(), quantity: parseInt(m[2], 10) || 1 };
    })
    .filter((i) => i.name);
}

export function OrderAssembleModal({
  order,
  stickers,
  recipes,
  onClose,
  onDone,
}: {
  order: OrderLite;
  stickers: StickerLite[];
  recipes: RecipeLite[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useDashboard();
  const [needs, setNeeds] = useState<NeedRow[]>([]);
  const [noRecipe, setNoRecipe] = useState<{ name: string; qty: number }[]>([]);
  const [adHocPicks, setAdHocPicks] = useState<Record<string, { ingredientId: string; qty: string }>>({});
  const [planLoading, setPlanLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawMaterials = stickers.filter((s) => s.category === "ohapka");
  const items = parseLineItems(order);

  function findSticker(rawName: string, decodedName: string) {
    return stickers.find((s) => s.product_name === rawName) ?? stickers.find((s) => decodeHtmlEntities(s.product_name) === decodedName);
  }

  useEffect(() => {
    (async () => {
      const noRecipeItems: { name: string; qty: number }[] = [];
      const needMap = new Map<string, number>();

      for (const item of items) {
        const sticker = findSticker(item.rawName, item.name);
        if (!sticker) {
          noRecipeItems.push({ name: item.name, qty: item.quantity });
          continue;
        }
        if (sticker.category === "ohapka") {
          needMap.set(sticker.id, (needMap.get(sticker.id) ?? 0) + item.quantity * sticker.order_unit_size);
          continue;
        }
        const bouquetRecipe = recipes.filter((r) => r.bouquet_sticker_id === sticker.id);
        if (bouquetRecipe.length === 0) {
          noRecipeItems.push({ name: item.name, qty: item.quantity });
          continue;
        }
        for (const r of bouquetRecipe) {
          needMap.set(r.ingredient_sticker_id, (needMap.get(r.ingredient_sticker_id) ?? 0) + r.quantity_needed * item.quantity);
        }
      }

      const ingredientIds = [...needMap.keys()];
      const supabase = createClient();
      const { data: batchData } = ingredientIds.length
        ? await supabase
            .from("batches")
            .select("id, product_sticker_id, remaining, purchase_date")
            .in("product_sticker_id", ingredientIds)
            .gt("remaining", 0)
            .order("purchase_date", { ascending: true })
        : { data: [] as BatchLite[] };

      const rows: NeedRow[] = ingredientIds.map((id) => {
        const sticker = stickers.find((s) => s.id === id);
        const availableBatches = (batchData ?? []).filter((b) => b.product_sticker_id === id);
        let toFill = needMap.get(id) ?? 0;
        const batches: BatchAlloc[] = availableBatches.map((b) => {
          const take = Math.min(b.remaining, Math.max(toFill, 0));
          toFill -= take;
          return { batchId: b.id, available: b.remaining, purchaseDate: b.purchase_date, take: take > 0 ? String(take) : "" };
        });
        return {
          ingredientId: id,
          ingredientName: sticker ? decodeHtmlEntities(sticker.product_name) : "—",
          unit: sticker?.unit ?? null,
          neededQty: needMap.get(id) ?? 0,
          batches,
        };
      });

      setNeeds(rows);
      setNoRecipe(noRecipeItems);
      setPlanLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  function updateTake(ingredientId: string, batchId: string, value: string) {
    setNeeds((prev) =>
      prev.map((n) =>
        n.ingredientId !== ingredientId ? n : { ...n, batches: n.batches.map((b) => (b.batchId === batchId ? { ...b, take: value } : b)) }
      )
    );
  }

  async function addAdHocToNeeds(lineName: string) {
    const pick = adHocPicks[lineName];
    if (!pick?.ingredientId || !(parseFloat(pick.qty) > 0)) return;
    const qty = parseFloat(pick.qty);
    const sticker = stickers.find((s) => s.id === pick.ingredientId);

    setNoRecipe((prev) => prev.filter((n) => n.name !== lineName));
    setNeeds((prev) => {
      const existing = prev.find((n) => n.ingredientId === pick.ingredientId);
      if (existing) return prev.map((n) => (n.ingredientId === pick.ingredientId ? { ...n, neededQty: n.neededQty + qty } : n));
      return [...prev, { ingredientId: pick.ingredientId, ingredientName: sticker ? decodeHtmlEntities(sticker.product_name) : "—", unit: sticker?.unit ?? null, neededQty: qty, batches: [] }];
    });

    const supabase = createClient();
    const { data: batchData } = await supabase
      .from("batches")
      .select("id, product_sticker_id, remaining, purchase_date")
      .eq("product_sticker_id", pick.ingredientId)
      .gt("remaining", 0)
      .order("purchase_date", { ascending: true });

    setNeeds((prev) =>
      prev.map((n) => {
        if (n.ingredientId !== pick.ingredientId || n.batches.length > 0) return n;
        let toFill = n.neededQty;
        const batches: BatchAlloc[] = (batchData ?? []).map((b) => {
          const take = Math.min(b.remaining, Math.max(toFill, 0));
          toFill -= take;
          return { batchId: b.id, available: b.remaining, purchaseDate: b.purchase_date, take: take > 0 ? String(take) : "" };
        });
        return { ...n, batches };
      })
    );
  }

  async function confirm() {
    setConfirming(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const need of needs) {
        for (const b of need.batches) {
          const take = parseFloat(b.take);
          if (!(take > 0)) continue;
          const { error: moveErr } = await supabase.from("stock_movements").insert({
            batch_id: b.batchId,
            change_qty: -take,
            reason: "sold",
            reference_type: "order",
            reference_id: order.id,
            created_by: user.id,
          });
          if (moveErr) throw new Error(moveErr.message);
        }
      }
      const { error: statusErr } = await supabase.from("tilda_orders").update({ status: "assembled" }).eq("id", order.id);
      if (statusErr) throw new Error(statusErr.message);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сборки");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Modal title={`Сборка №${order.order_id ?? "—"}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3">
          <p className="text-sm font-medium">{order.recipient_name ?? order.customer_name ?? "—"}</p>
          <div className="mt-1 space-y-0.5">
            {items.map((it, i) => (
              <p key={i} className="text-xs text-zinc-500 dark:text-zinc-400">
                {it.name} × {it.quantity}
              </p>
            ))}
          </div>
        </div>

        {planLoading ? (
          <p className="text-sm text-zinc-400">Считаем расход…</p>
        ) : (
          <>
            {needs.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Списать со склада</p>
                {needs.map((n) => {
                  const totalTaken = n.batches.reduce((sum, b) => sum + (parseFloat(b.take) || 0), 0);
                  const short = totalTaken < n.neededQty;
                  return (
                    <div key={n.ingredientId} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3">
                      <p className="text-sm font-medium">
                        {n.ingredientName} — нужно {n.neededQty} {n.unit ?? ""}
                        {short && <span className="ml-2 text-amber-600 dark:text-amber-400">не хватает {n.neededQty - totalTaken}</span>}
                      </p>
                      {n.batches.length === 0 ? (
                        <p className="mt-1 text-xs text-red-500">Нет партий на складе</p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {n.batches.map((b) => (
                            <div key={b.batchId} className="flex items-center gap-2 text-xs">
                              <span className="flex-1 text-zinc-400">
                                партия от {new Date(b.purchaseDate).toLocaleDateString("ru-RU")} (доступно {b.available})
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={b.available}
                                value={b.take}
                                onChange={(e) => updateTake(n.ingredientId, b.batchId, e.target.value)}
                                className="w-20 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {noRecipe.map((nr) => (
              <div key={nr.name} className="rounded-xl border border-dashed border-amber-300 dark:border-amber-500/40 p-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  «{nr.name}» × {nr.qty} — нет рецепта, укажи состав вручную
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={adHocPicks[nr.name]?.ingredientId ?? ""}
                    onChange={(e) => setAdHocPicks((p) => ({ ...p, [nr.name]: { ingredientId: e.target.value, qty: p[nr.name]?.qty ?? "1" } }))}
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1.5 text-sm"
                  >
                    <option value="">Что использовали…</option>
                    {rawMaterials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {decodeHtmlEntities(m.product_name)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={adHocPicks[nr.name]?.qty ?? "1"}
                    onChange={(e) => setAdHocPicks((p) => ({ ...p, [nr.name]: { ingredientId: p[nr.name]?.ingredientId ?? "", qty: e.target.value } }))}
                    className="w-16 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1.5 text-sm"
                  />
                  <button onClick={() => addAdHocToNeeds(nr.name)} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
                    Добавить
                  </button>
                </div>
              </div>
            ))}

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              onClick={confirm}
              disabled={confirming}
              className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {confirming ? "Списываем…" : "Подтвердить сборку"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
