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

type BatchLite = { id: string; product_sticker_id: string; remaining: number; purchase_date: string; estimated_wilt_date: string | null };
type RecipeRow = { id: string; bouquet_sticker_id: string; ingredient_sticker_id: string; quantity_needed: number };

function freshness(wiltDate: string | null): { label: string; className: string } {
  if (!wiltDate) return { label: "—", className: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" };
  const days = Math.round((new Date(wiltDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "просрочено", className: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400" };
  if (days <= 2) return { label: `${days} дн.`, className: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { label: `${days} дн.`, className: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
}

// Каталог и остатки — раньше были разными вкладками, хотя это одно и
// то же с двух сторон: что продаём и что реально лежит на складе.
// Для охапок наличие теперь считается само (по остатку, через триггер
// в базе) — руками тут ничего не переключаем, только смотрим партии и
// свежесть. Для готовых букетов/сетов своего учёта стеблей нет, там
// наличие "на сегодня" по-прежнему решает флорист сам.
export function CatalogTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [availableToday, setAvailableToday] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<BatchLite[]>([]);
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
    const [productsRes, availabilityRes, batchesRes, recipesRes] = await Promise.all([
      supabase.from("product_stickers").select("id, product_name, image_url, category, archived, quantity").order("product_name"),
      supabase.from("product_availability").select("product_name"),
      supabase.from("batches").select("id, product_sticker_id, remaining, purchase_date, estimated_wilt_date").gt("remaining", 0),
      supabase.from("product_recipes").select("id, bouquet_sticker_id, ingredient_sticker_id, quantity_needed"),
    ]);
    setProducts((productsRes.data ?? []).filter((p) => p.product_name !== "__default__" && !p.archived));
    setAvailableToday(new Set((availabilityRes.data ?? []).map((r) => r.product_name)));
    setBatches((batchesRes.data ?? []).sort((a, b) => a.purchase_date.localeCompare(b.purchase_date)));
    setRecipes(recipesRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Наличие букетов/сетов (без своих партий) — единственное, что
  // флорист ещё переключает руками.
  async function toggleBouquetAvailable(name: string) {
    const supabase = createClient();
    if (availableToday.has(name)) {
      await supabase.from("product_availability").delete().eq("product_name", name);
    } else {
      await supabase.from("product_availability").upsert({ product_name: name });
    }
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

  // В наличии — сначала. Внутри группы — по названию.
  const sorted = [...filtered].sort((a, b) => {
    const aIn = a.category === "ohapka" ? (a.quantity ?? 0) > 0 : availableToday.has(decodeHtmlEntities(a.product_name));
    const bIn = b.category === "ohapka" ? (b.quantity ?? 0) > 0 : availableToday.has(decodeHtmlEntities(b.product_name));
    if (aIn !== bIn) return aIn ? -1 : 1;
    return a.product_name.localeCompare(b.product_name);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Найти товар…"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={() => setAddingProduct((v) => !v)}
          className="shrink-0 rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm font-medium text-accent hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          + Добавить
        </button>
      </div>

      {addingProduct && (
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((p) => {
          const name = decodeHtmlEntities(p.product_name);
          const isOhapka = p.category === "ohapka";
          const inStock = (p.quantity ?? 0) > 0;
          const isAvailable = isOhapka ? inStock : availableToday.has(name);
          const productBatches = batches.filter((b) => b.product_sticker_id === p.id);
          const recipeOpen = openRecipeId === p.id;
          const recipe = recipes.filter((r) => r.bouquet_sticker_id === p.id);

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
                  {isOhapka && <p className="text-xs text-zinc-400">{p.quantity ?? 0} стеблей на складе</p>}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                {isOhapka ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      isAvailable
                        ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                    }`}
                    title="Считается само по остатку на складе"
                  >
                    {isAvailable ? "✓ В наличии" : "Нет в наличии"}
                  </span>
                ) : (
                  <button
                    onClick={() => toggleBouquetAvailable(name)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      isAvailable
                        ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                        : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {isAvailable ? "✓ В наличии" : "Нет сегодня"}
                  </button>
                )}
                {!isOhapka && (
                  <button
                    onClick={() => setOpenRecipeId(recipeOpen ? null : p.id)}
                    className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    {recipe.length > 0 ? `Состав: ${recipe.length}` : "Задать состав"} {recipeOpen ? "▴" : "▾"}
                  </button>
                )}
              </div>

              {isOhapka && productBatches.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                  {productBatches.map((b) => {
                    const f = freshness(b.estimated_wilt_date);
                    return (
                      <span
                        key={b.id}
                        title={`Партия от ${new Date(b.purchase_date).toLocaleDateString("ru-RU")}`}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${f.className}`}
                      >
                        {b.remaining} шт · {f.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {recipeOpen && (
                <div className="mt-2 space-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                  {recipe.map((r) => {
                    const ing = rawMaterials.find((m) => m.id === r.ingredient_sticker_id);
                    return (
                      <div key={r.id} className="flex items-center justify-between text-xs">
                        <span>
                          {ing ? decodeHtmlEntities(ing.product_name) : "—"} × {r.quantity_needed}
                        </span>
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
        {sorted.length === 0 && <p className="text-sm text-zinc-400">Ничего не найдено.</p>}
      </div>
    </div>
  );
}
