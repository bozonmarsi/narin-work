"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";

type Sticker = { id: string; product_name: string; category: string | null };
type RecipeRow = { id: string; bouquet_sticker_id: string; ingredient_sticker_id: string; quantity_needed: number };

export function RecipesTab({ onOpenCatalog }: { onOpenCatalog: () => void }) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newQty, setNewQty] = useState("1");

  async function load() {
    const supabase = createClient();
    const [stickersRes, recipesRes] = await Promise.all([
      supabase.from("product_stickers").select("id, product_name, category"),
      supabase.from("product_recipes").select("id, bouquet_sticker_id, ingredient_sticker_id, quantity_needed"),
    ]);
    setStickers(stickersRes.data ?? []);
    setRecipes(recipesRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  const rawMaterials = stickers.filter((s) => s.category === "ohapka");
  const bouquets = stickers
    .filter((s) => s.category !== "ohapka" && s.category !== "atelier" && s.category !== "otkrytka" && s.product_name !== "__default__")
    .filter((s) => decodeHtmlEntities(s.product_name).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.product_name.localeCompare(b.product_name));

  async function addIngredient(bouquetId: string) {
    if (!newIngredientId || !(parseFloat(newQty) > 0)) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("product_recipes")
      .upsert(
        { bouquet_sticker_id: bouquetId, ingredient_sticker_id: newIngredientId, quantity_needed: parseFloat(newQty) },
        { onConflict: "bouquet_sticker_id,ingredient_sticker_id" }
      )
      .select("id, bouquet_sticker_id, ingredient_sticker_id, quantity_needed")
      .single();
    if (error || !data) return;
    setRecipes((prev) => [...prev.filter((r) => r.id !== data.id), data]);
    setNewIngredientId("");
    setNewQty("1");
  }

  async function removeIngredient(id: string) {
    const supabase = createClient();
    await supabase.from("product_recipes").delete().eq("id", id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="max-w-2xl space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Найти букет…"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <p className="text-xs text-zinc-400">
        Здесь только готовые букеты/сеты (не сами цветы). Если нужного букета нет в списке — его сначала надо завести
        как товар в{" "}
        <button type="button" onClick={onOpenCatalog} className="text-accent underline">
          Каталоге
        </button>
        .
      </p>

      <div className="space-y-2">
        {bouquets.map((b) => {
          const isOpen = openId === b.id;
          const recipe = recipes.filter((r) => r.bouquet_sticker_id === b.id);
          return (
            <div key={b.id} className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3">
              <button onClick={() => setOpenId(isOpen ? null : b.id)} className="flex w-full items-center justify-between text-left text-sm">
                <span>{decodeHtmlEntities(b.product_name)}</span>
                <span className="text-xs text-zinc-400">{recipe.length > 0 ? `${recipe.length} ингредиентов` : "не задан"}</span>
              </button>

              {isOpen && (
                <div className="mt-2 space-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                  {recipe.map((r) => {
                    const ing = rawMaterials.find((m) => m.id === r.ingredient_sticker_id);
                    return (
                      <div key={r.id} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-600 dark:text-zinc-300">
                          {ing ? decodeHtmlEntities(ing.product_name) : "—"} × {r.quantity_needed}
                        </span>
                        <button onClick={() => removeIngredient(r.id)} className="text-zinc-400 hover:text-red-500">
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={newIngredientId}
                      onChange={(e) => setNewIngredientId(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm"
                    >
                      <option value="">Добавить ингредиент…</option>
                      {rawMaterials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {decodeHtmlEntities(m.product_name)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      className="w-16 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm"
                    />
                    <button onClick={() => addIngredient(b.id)} className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-white">
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {bouquets.length === 0 && <p className="text-sm text-zinc-400">Ничего не найдено.</p>}
      </div>
    </div>
  );
}
