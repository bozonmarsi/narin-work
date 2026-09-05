"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";

type Product = {
  id: string;
  product_name: string;
  image_url: string | null;
  category: string | null;
  archived: boolean;
  quantity: number | null;
};

type RecipeRow = { id: string; bouquet_sticker_id: string; ingredient_sticker_id: string; quantity_needed: number };

// Упрощённая версия "Магазина" под узкую колонку флориста — только то,
// что реально нужно день в день: список товаров, наличие, добавить
// новый, состав букета. Цены, бейджи, категории и архив — это уже
// вотчина полной страницы "Магазин" у менеджера.
export function CatalogTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [availableToday, setAvailableToday] = useState<Set<string>>(new Set());
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [addingProduct, setAddingProduct] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addingBusy, setAddingBusy] = useState(false);

  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("1");

  async function load() {
    const supabase = createClient();
    const [productsRes, availabilityRes, recipesRes] = await Promise.all([
      supabase.from("product_stickers").select("id, product_name, image_url, category, archived, quantity").order("product_name"),
      supabase.from("product_availability").select("product_name"),
      supabase.from("product_recipes").select("id, bouquet_sticker_id, ingredient_sticker_id, quantity_needed"),
    ]);
    setProducts((productsRes.data ?? []).filter((p) => p.product_name !== "__default__" && !p.archived));
    setAvailableToday(new Set((availabilityRes.data ?? []).map((r) => r.product_name)));
    setRecipes(recipesRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleAvailable(name: string) {
    const supabase = createClient();
    if (availableToday.has(name)) {
      await supabase.from("product_availability").delete().eq("product_name", name);
    } else {
      await supabase.from("product_availability").upsert({ product_name: name });
    }
    load();
  }

  async function adjustQuantity(id: string, delta: number) {
    const supabase = createClient();
    const product = products.find((p) => p.id === id);
    const next = Math.max(0, (product?.quantity ?? 0) + delta);
    await supabase.from("product_stickers").update({ quantity: next }).eq("id", id);
    load();
  }

  async function addProduct() {
    const name = newName.trim();
    if (!name) return;
    setAddingBusy(true);
    setAddError(null);
    const supabase = createClient();
    const id = crypto.randomUUID();
    let imageUrl = "";
    if (newFile) {
      const ext = newFile.name.split(".").pop() ?? "jpg";
      const { error: uploadErr } = await supabase.storage.from("product-stickers").upload(`${id}.${ext}`, newFile);
      if (uploadErr) {
        setAddError(uploadErr.message);
        setAddingBusy(false);
        return;
      }
      imageUrl = supabase.storage.from("product-stickers").getPublicUrl(`${id}.${ext}`).data.publicUrl;
    }
    const { error } = await supabase.from("product_stickers").insert({ id, product_name: name, image_url: imageUrl });
    if (error) {
      setAddError(error.message);
      setAddingBusy(false);
      return;
    }
    setNewName("");
    setNewFile(null);
    setAddingProduct(false);
    setAddingBusy(false);
    load();
  }

  async function addRecipeItem(bouquetId: string) {
    if (!newIngredientId || !(parseFloat(newIngredientQty) > 0)) return;
    const supabase = createClient();
    await supabase.from("product_recipes").upsert(
      { bouquet_sticker_id: bouquetId, ingredient_sticker_id: newIngredientId, quantity_needed: parseFloat(newIngredientQty) },
      { onConflict: "bouquet_sticker_id,ingredient_sticker_id" }
    );
    setNewIngredientId("");
    setNewIngredientQty("1");
    load();
  }

  async function removeRecipeItem(id: string) {
    const supabase = createClient();
    await supabase.from("product_recipes").delete().eq("id", id);
    load();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  const rawMaterials = products.filter((p) => p.category === "ohapka");
  const filtered = products.filter((p) => decodeHtmlEntities(p.product_name).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Найти товар…"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
      />

      {!addingProduct ? (
        <button
          onClick={() => setAddingProduct(true)}
          className="w-full rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 py-1.5 text-sm font-medium text-accent hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          + Добавить товар
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-accent/40 p-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название товара"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <input type="file" accept="image/*" onChange={(e) => setNewFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
          <div className="flex gap-2">
            <button onClick={() => setAddingProduct(false)} className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 py-1 text-xs">
              Отмена
            </button>
            <button
              onClick={addProduct}
              disabled={!newName.trim() || addingBusy}
              className="flex-1 rounded-md bg-accent py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              {addingBusy ? "Добавляю…" : "Добавить"}
            </button>
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        {filtered.map((p) => {
          const name = decodeHtmlEntities(p.product_name);
          const isAvailable = availableToday.has(name);
          const isOhapka = p.category === "ohapka";
          const recipeOpen = openRecipeId === p.id;
          const recipe = recipes.filter((r) => r.bouquet_sticker_id === p.id);
          return (
            <div key={p.id} className="rounded-md border border-zinc-200 dark:border-zinc-700 p-2">
              <div className="flex items-center gap-2">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" />
                )}
                <p className="min-w-0 flex-1 truncate text-sm">{name}</p>
                <div className="flex shrink-0 items-center gap-0.5 rounded-md ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700">
                  <button onClick={() => adjustQuantity(p.id, -1)} className="px-1.5 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    −
                  </button>
                  <span className="w-5 text-center text-xs font-medium">{p.quantity ?? "—"}</span>
                  <button onClick={() => adjustQuantity(p.id, 1)} className="px-1.5 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    +
                  </button>
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <button
                  onClick={() => toggleAvailable(name)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isAvailable
                      ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                      : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {isAvailable ? "✓ В наличии" : "Нет сегодня"}
                </button>
                {!isOhapka && (
                  <button
                    onClick={() => setOpenRecipeId(recipeOpen ? null : p.id)}
                    className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    {recipe.length > 0 ? `Состав: ${recipe.length}` : "Задать состав"} {recipeOpen ? "▴" : "▾"}
                  </button>
                )}
              </div>
              {recipeOpen && (
                <div className="mt-2 space-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                  {recipe.map((r) => {
                    const ing = rawMaterials.find((m) => m.id === r.ingredient_sticker_id);
                    return (
                      <div key={r.id} className="flex items-center justify-between text-xs">
                        <span>{ing ? decodeHtmlEntities(ing.product_name) : "—"} × {r.quantity_needed}</span>
                        <button onClick={() => removeRecipeItem(r.id)} className="text-zinc-400 hover:text-red-500">
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-1">
                    <select
                      value={newIngredientId}
                      onChange={(e) => setNewIngredientId(e.target.value)}
                      className="min-w-0 flex-1 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent px-1 py-1 text-xs"
                    >
                      <option value="">Ингредиент…</option>
                      {rawMaterials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {decodeHtmlEntities(m.product_name)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={newIngredientQty}
                      onChange={(e) => setNewIngredientQty(e.target.value)}
                      className="w-12 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent px-1 py-1 text-xs"
                    />
                    <button onClick={() => addRecipeItem(p.id)} className="rounded bg-accent px-2 py-1 text-xs font-medium text-white">
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-zinc-400">Ничего не найдено.</p>}
      </div>
    </div>
  );
}
