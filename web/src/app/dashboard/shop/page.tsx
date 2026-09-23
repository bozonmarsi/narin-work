"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { decodeHtmlEntities } from "@/lib/format";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { VanVlietPanel } from "./VanVlietPanel";

type ClosedDate = { closed_date: string; reason: string | null };
type ClosedSlot = { id: string; closed_date: string; slot_label: string; reason: string | null };
type RecipeRow = { id: string; bouquet_sticker_id: string; ingredient_sticker_id: string; quantity_needed: number };
type Product = {
  id: string;
  name: string;
  rawName: string;
  image_url: string | null;
  category: string | null;
  archived: boolean;
  special_order: boolean;
  flower_type: string[];
  color: string[];
  height: string | null;
  fragrant: boolean;
  badge_text: string | null;
  badge_color: string | null;
  quantity: number | null;
  order_unit_size: number;
  default_vase_life_days: number | null;
  vanvliet_in_stock: boolean | null;
  manually_hidden: boolean;
};

// Ниже этого остатка на сайте сама встаёт плашка "Zbývá N ks" — если
// менеджер не поставил свою плашку руками (та в приоритете).
const LOW_STOCK_THRESHOLD = 3;

// Готовые цвета для кастомной плашки на карточке товара на сайте —
// заведомо читаемые с белым текстом поверх фото.
const BADGE_COLOR_OPTIONS = [
  { value: "#02e590", label: "Мятный" },
  { value: "#ff2b21", label: "Красный" },
  { value: "#2a9a48", label: "Зелёный" },
  { value: "#ff7c76", label: "Розовый" },
  { value: "#196fe3", label: "Синий" },
];

const WEEKDAY_LABELS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

// Значения строго совпадают с value радиокнопок "Vyberte dobu doručení"
// на странице оплаты (name="delivery-time") — checkout-slot-blocker.html
// сверяет закрытые слоты именно по этим строкам.
const SLOT_LABELS = ["9-12", "12-15", "15-18", "18-20"];

const CATEGORY_OPTIONS = [
  { value: "buket", label: "Букеты", color: "bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 ring-pink-200 dark:ring-pink-500/30" },
  { value: "set", label: "Сеты", color: "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-purple-200 dark:ring-purple-500/30" },
  { value: "ohapka", label: "Náruče", color: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/30" },
  { value: "atelier", label: "Atelier", color: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/30" },
  { value: "darky", label: "Dárky", color: "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 ring-teal-200 dark:ring-teal-500/30" },
  { value: "kolekce", label: "Kolekce", color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/30" },
  { value: "banky", label: "Kovka", color: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-200 dark:ring-sky-500/30" },
];

// Составом (рецептом) из сырья набираются только собранные букеты/сеты.
// Охапки — сами сырьё, Atelier — авторская работа без фиксированного
// рецепта, Dárky (открытки, сладости и т.п.) — не цветы вообще, там
// рецепту взяться неоткуда.
const NO_RECIPE_CATEGORIES = new Set(["ohapka", "atelier", "darky"]);

function categoryLabel(value: string | null) {
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? null;
}

function categoryColor(value: string | null) {
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.color ?? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 ring-zinc-200 dark:ring-zinc-700";
}

// Тип цветка — отдельная ось тегов, нужна для кастомного фильтра на
// странице "Охапки" на сайте (встроенный фильтр Тильды не подошёл).
// Это осознанно грубые категории для покупателя, не путать с
// species_reference склада — там нужны конкретные сорта, а не эта
// огрублённая ось (см. миграцию 20260905030000 для объяснения).
const FLOWER_TYPE_OPTIONS = [
  "Tulipán",
  "Karafiát",
  "Pivoňka",
  "Ranunkulus",
  "Kala",
  "Hortenzie",
  "Hyacint",
  "Fialka",
  "Exotika",
  "Vytrvalé",
];

function normalizeForMatch(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Чешские названия почти всегда содержат тип цветка прямо в тексте
// ("Pivoňka bílá", "Tulipán žlutý") — сравниваем без учёта диакритики.
function guessFlowerType(name: string): string | null {
  const normalized = normalizeForMatch(name);
  return FLOWER_TYPE_OPTIONS.find((t) => normalized.includes(normalizeForMatch(t))) ?? null;
}

// Основа слова без окончания — чешские прилагательные цвета склоняются по
// роду (bílá/bílý/bílé), но основа одна и та же, так что сравниваем по ней.
const COLOR_OPTIONS: { label: string; stem: string }[] = [
  { label: "Bílá", stem: "bil" },
  { label: "Růžová", stem: "ruzov" },
  { label: "Červená", stem: "cerven" },
  { label: "Žlutá", stem: "zlut" },
  { label: "Fialová", stem: "fialov" },
  { label: "Modrá", stem: "modr" },
];

function guessColor(name: string): string | null {
  const normalized = normalizeForMatch(name);
  return COLOR_OPTIONS.find((c) => normalized.includes(c.stem))?.label ?? null;
}

const HEIGHT_OPTIONS = ["Nízké", "Vysoké"];
const HEIGHT_THRESHOLD_CM = 45;

// Угадывается только если в названии реально есть см ("Vrba 60cm") — для
// остальных товаров без числа в названии останется пустым, руками.
function guessHeight(name: string): string | null {
  const match = name.match(/(\d+)\s*cm/i);
  if (!match) return null;
  const cm = parseInt(match[1], 10);
  return cm >= HEIGHT_THRESHOLD_CM ? "Vysoké" : "Nízké";
}

// Ровно то же условие, что и в get_unsourceable_products(): либо
// менеджер скрыл товар вручную (любая категория, приоритет над всем
// остальным), либо это охапка без своего остатка и без подтверждения
// от Van Vliet и не поставленная под заказ вручную — в обоих случаях
// карточка реально скрыта с сайта клиента прямо сейчас.
function isHiddenFromSite(p: Product): boolean {
  if (p.manually_hidden) return true;
  return p.category === "ohapka" && !p.special_order && (p.quantity ?? 0) <= 0 && p.vanvliet_in_stock !== true;
}

// Порядок карточек в Каталоге у менеджера: зелёные (в наличии) → синие
// (по умолчанию, "привезём завтра") → красные (под заказ) → серые (скрыто
// с сайта / архив) — тот же приоритет цветов, что и cardTone ниже, просто
// как сортировка вместо оформления.
function toneRank(p: Product, isAvailable: boolean): number {
  if (p.archived || isHiddenFromSite(p)) return 3;
  if (p.special_order) return 2;
  if (isAvailable) return 0;
  return 1;
}

function ProductCard({
  product: p,
  isAvailable,
  uploadingId,
  recipe,
  rawMaterials,
  onToggleAvailable,
  onSetCategory,
  onToggleFlowerType,
  onToggleColor,
  onSetHeight,
  onToggleFragrant,
  onUploadImage,
  onToggleSpecialOrder,
  onToggleManualHide,
  onToggleArchived,
  onSetBadge,
  onAddDelivery,
  onAddRecipeItem,
  onRemoveRecipeItem,
  onSetOrderUnitSize,
  onSetVaseLife,
}: {
  product: Product;
  isAvailable: boolean;
  uploadingId: string | null;
  recipe: RecipeRow[];
  rawMaterials: { id: string; name: string }[];
  onToggleAvailable: (name: string) => void;
  onSetCategory: (id: string, category: string) => void;
  onToggleFlowerType: (id: string, type: string) => void;
  onToggleColor: (id: string, color: string) => void;
  onSetHeight: (id: string, height: string) => void;
  onToggleFragrant: (id: string, current: boolean) => void;
  onUploadImage: (id: string, file: File) => void;
  onToggleSpecialOrder: (id: string, current: boolean) => void;
  onToggleManualHide: (id: string, current: boolean) => void;
  onToggleArchived: (id: string, current: boolean) => void;
  onSetBadge: (id: string, text: string | null, color: string | null) => void;
  onAddDelivery: (id: string, delta: number) => void;
  onAddRecipeItem: (bouquetId: string, ingredientId: string, qty: number) => void;
  onRemoveRecipeItem: (recipeId: string) => void;
  onSetOrderUnitSize: (id: string, size: number) => void;
  onSetVaseLife: (id: string, days: number) => void;
}) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("1");
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [badgeDraftText, setBadgeDraftText] = useState(p.badge_text ?? "");
  const [badgeDraftColor, setBadgeDraftColor] = useState(p.badge_color ?? BADGE_COLOR_OPTIONS[0].value);
  const label = categoryLabel(p.category);
  const tagSummary = [...p.flower_type, ...p.color, p.height, p.fragrant ? "Voňavé" : null]
    .filter(Boolean)
    .join(", ");
  const hiddenFromSite = isHiddenFromSite(p);

  // Тот же приоритет, что и бейдж на самом сайте (catalog-availability-
  // badges.html): скрыто > под заказ (красный, как "Doručíme <дата>") >
  // в наличии сегодня (зелёный, "Doručíme dnes") > по умолчанию (синий,
  // "Doručíme zítra"). Цвета карточки в Каталоге — не просто оформление,
  // это прямое отражение того, что увидит клиент на сайте.
  const cardTone = p.archived
    ? "opacity-60 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
    : hiddenFromSite
      ? "border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800"
      : p.special_order
        ? "border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 ring-1 ring-red-200 dark:ring-red-500/30"
        : isAvailable
          ? "border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10 ring-1 ring-green-200 dark:ring-green-500/30"
          : "border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/10";

  return (
    <div className={`flex flex-col gap-1.5 rounded-lg border p-2 ${cardTone}`}>
      <div className="flex gap-2">
        <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
          {p.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-center text-[9px] text-zinc-300 dark:text-zinc-600">Нет фото</div>
          )}
          <label
            title="Заменить фото"
            className="absolute right-0.5 top-0.5 cursor-pointer rounded-full bg-white/90 dark:bg-zinc-800/90 px-1 py-0.5 text-[9px] shadow hover:bg-white dark:hover:bg-zinc-700"
          >
            ✎
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUploadImage(p.id, e.target.files[0])}
            />
          </label>
          {uploadingId === p.id && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70 text-[8px] text-zinc-500 dark:text-zinc-400">
              Загрузка…
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 text-[11px] font-medium text-zinc-800 dark:text-zinc-100">{p.name}</p>
          {label && (
            <span className={`w-fit rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 ring-inset ${categoryColor(p.category)}`}>
              {label}
            </span>
          )}
          <select
            value={p.category ?? ""}
            onChange={(e) => onSetCategory(p.id, e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-1 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-300"
          >
            <option value="">Без категории</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setTagsOpen((v) => !v)}
          className="line-clamp-1 text-left text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {tagSummary || "Метки цветка…"} {tagsOpen ? "▴" : "▾"}
        </button>
          {tagsOpen && (
            <div className="mt-1 space-y-1 rounded-md border border-zinc-200 dark:border-zinc-700 p-1.5">
              <div className="flex flex-wrap gap-1">
                {FLOWER_TYPE_OPTIONS.map((t) => {
                  const active = p.flower_type.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onToggleFlowerType(p.id, t)}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        active
                          ? "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300"
                          : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1">
                {COLOR_OPTIONS.map((c) => {
                  const active = p.color.includes(c.label);
                  return (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => onToggleColor(p.id, c.label)}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        active
                          ? "bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300"
                          : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1">
                {HEIGHT_OPTIONS.map((h) => {
                  const active = p.height === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => onSetHeight(p.id, active ? "" : h)}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        active
                          ? "bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300"
                          : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onToggleFragrant(p.id, p.fragrant)}
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    p.fragrant
                      ? "bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300"
                      : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  🌸 Voňavé
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={NO_RECIPE_CATEGORIES.has(p.category ?? "") ? "hidden" : undefined}>
          <button
            type="button"
            onClick={() => setRecipeOpen((v) => !v)}
            className="line-clamp-1 text-left text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            {recipe.length > 0 ? `Состав: ${recipe.length}` : "Состав не задан"} {recipeOpen ? "▴" : "▾"}
          </button>
          {recipeOpen && (
            <div className="mt-1 space-y-1 rounded-md border border-zinc-200 dark:border-zinc-700 p-1.5">
              {recipe.map((r) => {
                const ing = rawMaterials.find((m) => m.id === r.ingredient_sticker_id);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {ing?.name ?? "—"} × {r.quantity_needed}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveRecipeItem(r.id)}
                      className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center gap-1 pt-0.5">
                <select
                  value={newIngredientId}
                  onChange={(e) => setNewIngredientId(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-1 py-0.5 text-[10px]"
                >
                  <option value="">Ингредиент…</option>
                  {rawMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={newIngredientQty}
                  onChange={(e) => setNewIngredientQty(e.target.value)}
                  className="w-10 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-1 py-0.5 text-[10px]"
                />
                <button
                  type="button"
                  disabled={!newIngredientId || !(parseFloat(newIngredientQty) > 0)}
                  onClick={() => {
                    onAddRecipeItem(p.id, newIngredientId, parseFloat(newIngredientQty));
                    setNewIngredientId("");
                    setNewIngredientQty("1");
                  }}
                  className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-1">
            {p.badge_text ? (
              <div className="flex items-center gap-1">
                <span
                  className="w-fit rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                  style={{ backgroundColor: p.badge_color ?? BADGE_COLOR_OPTIONS[0].value }}
                >
                  {p.badge_text}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBadgeDraftText(p.badge_text ?? "");
                    setBadgeDraftColor(p.badge_color ?? BADGE_COLOR_OPTIONS[0].value);
                    setBadgeOpen((v) => !v);
                  }}
                  className="text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  {badgeOpen ? "▴" : "✎"}
                </button>
                <button
                  type="button"
                  onClick={() => onSetBadge(p.id, null, null)}
                  className="text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setBadgeDraftText("");
                  setBadgeDraftColor(BADGE_COLOR_OPTIONS[0].value);
                  setBadgeOpen((v) => !v);
                }}
                className="text-left text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                + Добавить плашку {badgeOpen ? "▴" : "▾"}
              </button>
            )}

            <div
              className={`flex shrink-0 items-center gap-0.5 rounded-md ring-1 ring-inset ${
                p.quantity !== null && p.quantity < LOW_STOCK_THRESHOLD
                  ? "ring-orange-300 dark:ring-orange-500/40"
                  : "ring-zinc-200 dark:ring-zinc-700"
              }`}
              title="Наличие (шт.)"
            >
              <button
                type="button"
                onClick={() => onAddDelivery(p.id, -1)}
                className="px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100"
              >
                −
              </button>
              <span className="w-4 text-center text-[10px] font-medium text-zinc-700 dark:text-zinc-200">{p.quantity ?? "—"}</span>
              <button
                type="button"
                onClick={() => onAddDelivery(p.id, 1)}
                className="px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100"
              >
                +
              </button>
            </div>
          </div>
          {p.category === "ohapka" && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="flex items-center gap-1" title="Сколько стеблей в одной единице заказа на сайте (весовой товар в Tilda)">
                <span className="text-[9px] text-zinc-400">стеблей/ед.:</span>
                <input
                  type="number"
                  min={1}
                  defaultValue={p.order_unit_size}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v > 0 && v !== p.order_unit_size) onSetOrderUnitSize(p.id, v);
                  }}
                  className="w-10 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent px-1 py-0 text-[10px]"
                />
              </div>
              <div className="flex items-center gap-1" title="Сколько дней товар свежий после приёмки — определяет дату увядания партии на складе. Действует только на новые приёмки.">
                <span className="text-[9px] text-zinc-400">дней свежести:</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={p.default_vase_life_days ?? ""}
                  placeholder="—"
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 0 && v !== p.default_vase_life_days) onSetVaseLife(p.id, v);
                  }}
                  className="w-10 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent px-1 py-0 text-[10px]"
                />
              </div>
            </div>
          )}
          {badgeOpen && (
            <div className="mt-1 space-y-1 rounded-md border border-zinc-200 dark:border-zinc-700 p-1.5">
              <input
                value={badgeDraftText}
                onChange={(e) => setBadgeDraftText(e.target.value)}
                placeholder="Например: Začátek sezóny"
                maxLength={30}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:text-zinc-200"
              />
              <div className="flex flex-wrap gap-1">
                {BADGE_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setBadgeDraftColor(c.value)}
                    className={`h-5 w-5 rounded-full ${badgeDraftColor === c.value ? "ring-2 ring-offset-1 ring-zinc-500 dark:ring-zinc-300 dark:ring-offset-zinc-900" : ""}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!badgeDraftText.trim()}
                  onClick={() => {
                    onSetBadge(p.id, badgeDraftText.trim(), badgeDraftColor);
                    setBadgeOpen(false);
                  }}
                  className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-40"
                >
                  Uložit
                </button>
                <button
                  type="button"
                  onClick={() => setBadgeOpen(false)}
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-300"
                >
                  Zrušit
                </button>
              </div>
            </div>
          )}
        </div>

      <div className="mt-auto flex flex-col gap-1 pt-0.5">
        {hiddenFromSite && (
          <p
            title={
              p.manually_hidden
                ? "Скрыто вручную — нажми «Показать на сайте» ниже, чтобы вернуть."
                : "Нет своего остатка и нет подтверждения от Van Vliet — карточка не показывается покупателям. Поставь «Под заказ» ниже, если реально можешь привезти."
            }
            className="rounded-md bg-red-50 dark:bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-200 dark:ring-red-500/30"
          >
            🚫 {p.manually_hidden ? "Скрыто вручную" : "Скрыто с сайта"}
          </p>
        )}
        {p.special_order ? (
          <p className="rounded-md bg-orange-50 dark:bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-600 dark:text-orange-400 ring-1 ring-inset ring-orange-200 dark:ring-orange-500/30">
            🚚 Всегда под заказ (+2 дня)
          </p>
        ) : p.category === "ohapka" ? (
          <>
            {/* Наличие охапок считается само по остатку со склада (см.
                tg_sync_ohapka_availability) — ручной тоггл тут только
                мешал бы: секунду спустя следующее движение по складу
                снова перезапишет product_availability поверх ручного
                клика. */}
            <span
              title="Считается само по остатку на складе — меняется после приёмки/списания у флориста"
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                isAvailable
                  ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-200 dark:ring-green-500/30"
                  : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {isAvailable ? "✓ В наличии" : "Нет в наличии"}
            </span>
          </>
        ) : (
          <button
            onClick={() => onToggleAvailable(p.name)}
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              isAvailable
                ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-200 dark:ring-green-500/30"
                : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {isAvailable ? "✓ В наличии" : "Нет сегодня"}
          </button>
        )}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => onToggleSpecialOrder(p.id, p.special_order)}
            className={`text-[10px] hover:text-orange-600 dark:hover:text-orange-400 ${
              hiddenFromSite ? "font-semibold text-orange-600 dark:text-orange-400" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {p.special_order ? "Убрать «под заказ»" : "🚚 Под заказ"}
          </button>
          <button
            onClick={() => onToggleManualHide(p.id, p.manually_hidden)}
            title="Скрыть карточку с клиентского сайта вручную, независимо от остатка"
            className={`text-[10px] hover:text-red-600 dark:hover:text-red-400 ${
              p.manually_hidden ? "font-semibold text-red-600 dark:text-red-400" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {p.manually_hidden ? "👁 Показать на сайте" : "🙈 Скрыть с сайта"}
          </button>
          <button
            onClick={() => onToggleArchived(p.id, p.archived)}
            className="text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
          >
            {p.archived ? "↩ Вернуть" : "🗄 Архив"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  const { profile } = useDashboard();

  // "Заказы цветов" (заказ у поставщика Van Vliet) — только для менеджера,
  // не для склада: это решение о деньгах, а не о наличии на полке.
  const [mainTab, setMainTab] = useState<"catalog" | "orders" | "hours">("catalog");

  const [weeklyClosed, setWeeklyClosed] = useState<Set<number>>(new Set());
  const [closedDates, setClosedDates] = useState<ClosedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClosedDate, setNewClosedDate] = useState({ date: "", reason: "" });
  const [closedDateError, setClosedDateError] = useState<string | null>(null);
  const [closedSlots, setClosedSlots] = useState<ClosedSlot[]>([]);
  const [newClosedSlot, setNewClosedSlot] = useState({ date: "", slot: SLOT_LABELS[0], reason: "" });
  const [closedSlotError, setClosedSlotError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [availableToday, setAvailableToday] = useState<Set<string>>(new Set());
  const [availabilitySearch, setAvailabilitySearch] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("");
  const [newProductFile, setNewProductFile] = useState<File | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [addProductError, setAddProductError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillResult, setAutoFillResult] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [weeklyRes, datesRes, slotsRes] = await Promise.all([
      supabase.from("shop_weekly_closed_days").select("weekday"),
      supabase.from("shop_closed_dates").select("closed_date, reason").order("closed_date"),
      supabase.from("shop_closed_slots").select("id, closed_date, slot_label, reason").order("closed_date"),
    ]);
    setWeeklyClosed(new Set((weeklyRes.data ?? []).map((r) => r.weekday)));
    setClosedDates(datesRes.data ?? []);
    setClosedSlots(slotsRes.data ?? []);
    setLoading(false);
  }, []);

  const loadAvailability = useCallback(async () => {
    const supabase = createClient();
    const [productsRes, availabilityRes] = await Promise.all([
      supabase
        .from("product_stickers")
        .select(
          "id, product_name, image_url, category, archived, special_order, flower_type, color, height, fragrant, badge_text, badge_color, quantity, order_unit_size, default_vase_life_days, vanvliet_in_stock, manually_hidden",
        )
        .order("product_name", { ascending: true }),
      supabase.from("product_availability").select("product_name"),
    ]);
    setProducts(
      (productsRes.data ?? [])
        .filter((p) => p.product_name && p.product_name !== "__default__")
        .map((p) => ({
          id: p.id,
          name: decodeHtmlEntities(p.product_name),
          rawName: p.product_name,
          image_url: p.image_url ?? null,
          category: p.category ?? null,
          archived: p.archived ?? false,
          special_order: p.special_order ?? false,
          flower_type: p.flower_type ?? [],
          color: p.color ?? [],
          height: p.height ?? null,
          fragrant: p.fragrant ?? false,
          badge_text: p.badge_text ?? null,
          badge_color: p.badge_color ?? null,
          quantity: p.quantity ?? null,
          order_unit_size: p.order_unit_size ?? 1,
          default_vase_life_days: p.default_vase_life_days ?? null,
          vanvliet_in_stock: p.vanvliet_in_stock ?? null,
          manually_hidden: p.manually_hidden ?? false,
        })),
    );
    setAvailableToday(new Set((availabilityRes.data ?? []).map((r) => r.product_name)));
  }, []);

  useEffect(() => {
    load();
    loadAvailability();
    createClient()
      .from("product_recipes")
      .select("id, bouquet_sticker_id, ingredient_sticker_id, quantity_needed")
      .then(({ data }) => setRecipes(data ?? []));
  }, [load, loadAvailability]);

  async function addRecipeItem(bouquetId: string, ingredientId: string, qty: number) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("product_recipes")
      .upsert(
        { bouquet_sticker_id: bouquetId, ingredient_sticker_id: ingredientId, quantity_needed: qty },
        { onConflict: "bouquet_sticker_id,ingredient_sticker_id" }
      )
      .select("id, bouquet_sticker_id, ingredient_sticker_id, quantity_needed")
      .single();
    if (error || !data) return;
    setRecipes((prev) => [...prev.filter((r) => r.id !== data.id), data]);
  }

  async function removeRecipeItem(id: string) {
    const supabase = createClient();
    await supabase.from("product_recipes").delete().eq("id", id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  useRealtimeRefresh("product_availability", loadAvailability);
  // Остаток у Van Vliet проставляет сканер дважды в день — бейдж "Скрыто
  // с сайта" должен обновиться сам, без перезагрузки страницы.
  useRealtimeRefresh("product_stickers", loadAvailability);

  // Keyed by the decoded display name (not the raw product_stickers.product_name,
  // which sometimes has literal HTML entities baked in, e.g. "b&iacute;l&aacute;")
  // so it matches the clean text Tilda's catalog page renders in the DOM.
  async function toggleAvailable(name: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (availableToday.has(name)) {
      await supabase.from("product_availability").delete().eq("product_name", name);
    } else {
      await supabase
        .from("product_availability")
        .upsert({ product_name: name, updated_by: user?.id ?? null, updated_at: new Date().toISOString() });
    }
    loadAvailability();
  }

  async function resetAvailability() {
    const supabase = createClient();
    await supabase.from("product_availability").delete().neq("product_name", "");
    loadAvailability();
  }

  async function uploadStickerImage(productId: string, file: File) {
    setUploadError(null);
    setUploadingId(productId);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${productId}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("product-stickers").upload(path, file, { upsert: true });
    if (uploadErr) {
      setUploadError(uploadErr.message);
      setUploadingId(null);
      return;
    }
    const { data: urlData } = supabase.storage.from("product-stickers").getPublicUrl(path);
    await supabase
      .from("product_stickers")
      .update({ image_url: `${urlData.publicUrl}?t=${Date.now()}` })
      .eq("id", productId);
    setUploadingId(null);
    loadAvailability();
  }

  async function addProduct() {
    const name = newProductName.trim();
    if (!name) return;
    setAddProductError(null);
    setAddingProduct(true);
    const supabase = createClient();
    const id = crypto.randomUUID();

    // image_url is NOT NULL in product_stickers — existing photo-less rows
    // use "" rather than null, so match that instead of sending null.
    let imageUrl = "";
    if (newProductFile) {
      const ext = newProductFile.name.split(".").pop() ?? "jpg";
      const path = `${id}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("product-stickers").upload(path, newProductFile);
      if (uploadErr) {
        setAddProductError(uploadErr.message);
        setAddingProduct(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("product-stickers").getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }

    const category = newProductCategory || null;
    const { error } = await supabase
      .from("product_stickers")
      .insert({ id, product_name: name, image_url: imageUrl, category });
    if (error) {
      setAddProductError(error.message);
      setAddingProduct(false);
      return;
    }

    // Новая охапка сразу отправляется на подбор соответствия с Van
    // Vliet — не ждать до следующего планового прогона раз в 2 недели,
    // чтобы товар сразу стало видно в поиске у поставщика. Не блокирует
    // форму — работает в фоне, результат появится в панели Van Vliet.
    if (category === "ohapka") {
      supabase.functions.invoke("vanvliet-alias-refresh", { body: {} }).catch(() => {});
    }

    setNewProductName("");
    setNewProductCategory("");
    setNewProductFile(null);
    setAddingProduct(false);
    loadAvailability();
  }

  async function setCategory(productId: string, category: string) {
    const supabase = createClient();
    await supabase
      .from("product_stickers")
      .update({ category: category || null })
      .eq("id", productId);
    loadAvailability();
  }

  async function setBadge(productId: string, text: string | null, color: string | null) {
    const supabase = createClient();
    await supabase
      .from("product_stickers")
      .update({ badge_text: text, badge_color: text ? color : null })
      .eq("id", productId);
    loadAvailability();
  }

  async function addDelivery(productId: string, delta: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const next = Math.max(0, (product.quantity ?? 0) + delta);
    const supabase = createClient();
    await supabase.from("product_stickers").update({ quantity: next }).eq("id", productId);
    loadAvailability();
  }

  async function toggleFlowerType(productId: string, flowerType: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const next = product.flower_type.includes(flowerType)
      ? product.flower_type.filter((t) => t !== flowerType)
      : [...product.flower_type, flowerType];
    const supabase = createClient();
    await supabase
      .from("product_stickers")
      .update({ flower_type: next.length > 0 ? next : null })
      .eq("id", productId);
    loadAvailability();
  }

  async function toggleColor(productId: string, color: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const next = product.color.includes(color) ? product.color.filter((c) => c !== color) : [...product.color, color];
    const supabase = createClient();
    await supabase
      .from("product_stickers")
      .update({ color: next.length > 0 ? next : null })
      .eq("id", productId);
    loadAvailability();
  }

  async function toggleFragrant(productId: string, current: boolean) {
    const supabase = createClient();
    await supabase.from("product_stickers").update({ fragrant: !current }).eq("id", productId);
    loadAvailability();
  }

  async function setOrderUnitSize(productId: string, size: number) {
    const supabase = createClient();
    await supabase.from("product_stickers").update({ order_unit_size: size }).eq("id", productId);
    loadAvailability();
  }

  // Действует только на будущие приёмки — дата увядания уже принятой
  // партии это снимок на момент приёмки, задним числом не переписывается.
  async function setVaseLife(productId: string, days: number) {
    const supabase = createClient();
    await supabase.from("product_stickers").update({ default_vase_life_days: days }).eq("id", productId);
    loadAvailability();
  }

  async function setHeight(productId: string, height: string) {
    const supabase = createClient();
    await supabase
      .from("product_stickers")
      .update({ height: height || null })
      .eq("id", productId);
    loadAvailability();
  }

  async function autoFillTags() {
    setAutoFilling(true);
    const supabase = createClient();
    const candidates = products.filter((p) => !p.archived && p.category === "ohapka");
    let filled = 0;
    for (const p of candidates) {
      const update: Record<string, string | string[]> = {};
      if (p.flower_type.length === 0) {
        const guessed = guessFlowerType(p.name);
        if (guessed) update.flower_type = [guessed];
      }
      if (p.color.length === 0) {
        const guessed = guessColor(p.name);
        if (guessed) update.color = [guessed];
      }
      if (!p.height) {
        const guessed = guessHeight(p.name);
        if (guessed) update.height = guessed;
      }
      if (Object.keys(update).length > 0) {
        await supabase.from("product_stickers").update(update).eq("id", p.id);
        filled++;
      }
    }
    setAutoFillResult(`Заполнено полей у ${filled} товаров — проверьте и поправьте, что угадалось неверно.`);
    setAutoFilling(false);
    loadAvailability();
  }

  async function toggleArchived(productId: string, archived: boolean) {
    const supabase = createClient();
    await supabase.from("product_stickers").update({ archived: !archived }).eq("id", productId);
    loadAvailability();
  }

  async function toggleSpecialOrder(productId: string, specialOrder: boolean) {
    const supabase = createClient();
    await supabase.from("product_stickers").update({ special_order: !specialOrder }).eq("id", productId);
    loadAvailability();
  }

  async function toggleManualHide(productId: string, manuallyHidden: boolean) {
    const supabase = createClient();
    await supabase.from("product_stickers").update({ manually_hidden: !manuallyHidden }).eq("id", productId);
    loadAvailability();
  }

  const activeProducts = useMemo(() => products.filter((p) => !p.archived), [products]);

  // Ингредиенты для рецептов — те же product_stickers с категорией
  // "ohapka" (продаются поштучно одним видом), больше ничего искать не
  // нужно, это уже загружено в `products`.
  const rawMaterialOptions = useMemo(
    () => products.filter((p) => p.category === "ohapka").map((p) => ({ id: p.id, name: p.name })),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = availabilitySearch.trim().toLowerCase();
    const base =
      activeTab === "archive"
        ? products.filter((p) => p.archived)
        : activeTab === "all"
          ? activeProducts
          : activeProducts.filter((p) => p.category === activeTab);
    if (!q) return base;
    return base.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, activeProducts, availabilitySearch, activeTab]);

  // Сначала зелёные (в наличии), потом синие (по умолчанию), потом
  // красные (под заказ), потом серые (скрыто с сайта / архив) — тот же
  // порядок, что и цвета карточки (toneRank), чтобы список сразу читался
  // по важности. Внутри зелёных, как и раньше: у кого меньше остаток
  // среди охапок, тот выше — то, что заканчивается, сразу бросается в
  // глаза (порядок такой же, как у флориста на складе, CatalogTab).
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const aAvail = availableToday.has(a.name);
      const bAvail = availableToday.has(b.name);
      const aRank = toneRank(a, aAvail);
      const bRank = toneRank(b, bAvail);
      if (aRank !== bRank) return aRank - bRank;
      if (aRank === 0 && a.category === "ohapka" && b.category === "ohapka") {
        return (a.quantity ?? 0) - (b.quantity ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
  }, [filteredProducts, availableToday]);

  const availableCount = useMemo(
    () => activeProducts.filter((p) => availableToday.has(p.name)).length,
    [activeProducts, availableToday],
  );

  const archivedCount = useMemo(() => products.filter((p) => p.archived).length, [products]);

  async function toggleWeekday(day: number) {
    const supabase = createClient();
    const { error } = weeklyClosed.has(day)
      ? await supabase.from("shop_weekly_closed_days").delete().eq("weekday", day)
      : await supabase.from("shop_weekly_closed_days").insert({ weekday: day });
    if (error) {
      alert(`Не удалось изменить "${WEEKDAY_LABELS[day]}": ${error.message}`);
      return;
    }
    load();
  }

  async function addClosedDate() {
    if (!newClosedDate.date) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("shop_closed_dates")
      .insert({ closed_date: newClosedDate.date, reason: newClosedDate.reason.trim() || null });
    if (error) {
      setClosedDateError(error.code === "23505" ? "Этот день уже в списке закрытых." : error.message);
      return;
    }
    setClosedDateError(null);
    setNewClosedDate({ date: "", reason: "" });
    load();
  }

  async function removeClosedDate(date: string) {
    const supabase = createClient();
    await supabase.from("shop_closed_dates").delete().eq("closed_date", date);
    load();
  }

  async function addClosedSlot() {
    if (!newClosedSlot.date) return;
    const supabase = createClient();
    const { error } = await supabase.from("shop_closed_slots").insert({
      closed_date: newClosedSlot.date,
      slot_label: newClosedSlot.slot,
      reason: newClosedSlot.reason.trim() || null,
    });
    if (error) {
      setClosedSlotError(error.code === "23505" ? "Этот слот на эту дату уже закрыт." : error.message);
      return;
    }
    setClosedSlotError(null);
    setNewClosedSlot({ date: "", slot: SLOT_LABELS[0], reason: "" });
    load();
  }

  async function removeClosedSlot(id: string) {
    const supabase = createClient();
    await supabase.from("shop_closed_slots").delete().eq("id", id);
    load();
  }

  if (profile?.role !== "manager" && profile?.role !== "warehouse") return null;
  if (loading) return <p className="text-zinc-500 dark:text-zinc-400">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Магазин</h1>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setMainTab("catalog")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            mainTab === "catalog" ? "bg-accent text-white" : "border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          Каталог
        </button>
        {profile?.role === "manager" && (
          <button
            onClick={() => setMainTab("orders")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              mainTab === "orders" ? "bg-accent text-white" : "border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            Заказы цветов
          </button>
        )}
        <button
          onClick={() => setMainTab("hours")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            mainTab === "hours" ? "bg-accent text-white" : "border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          Режим работы
        </button>
      </div>

      {mainTab === "orders" && profile?.role === "manager" && <VanVlietPanel />}

      {mainTab === "hours" && (
      <section className="space-y-3">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Эти дни используются при расчёте дат доставок для подписок (нерабочие дни автоматически пропускаются).
        </p>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="mb-3 font-medium">Регулярно закрыто</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={day}
                onClick={() => toggleWeekday(day)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  weeklyClosed.has(day) ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400" : "border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="mb-3 font-medium">Разовые закрытые дни (праздники и т.п.)</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="date"
              value={newClosedDate.date}
              onChange={(e) => setNewClosedDate((d) => ({ ...d, date: e.target.value }))}
              className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
            />
            <input
              value={newClosedDate.reason}
              onChange={(e) => setNewClosedDate((d) => ({ ...d, reason: e.target.value }))}
              placeholder="Причина"
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
            />
            <button onClick={addClosedDate} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              + Добавить
            </button>
          </div>
          {closedDateError && <p className="mb-3 text-xs text-red-500">{closedDateError}</p>}
          {closedDates.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">Разовых закрытых дат пока нет.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {closedDates.map((d) => (
                <span key={d.closed_date} className="flex items-center gap-2 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-200">
                  {d.closed_date}
                  {d.reason ? ` — ${d.reason}` : ""}
                  <button onClick={() => removeClosedDate(d.closed_date)} className="text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="mb-1 font-medium">Закрытые интервалы доставки</p>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Закрывает конкретный интервал времени на конкретную дату (например, курьеры на завтра уже заняты
            на 12-15) — на странице оплаты этот слот станет полупрозрачным и недоступным для выбора,
            остальные слоты и остальные даты продолжают работать как обычно.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="date"
              value={newClosedSlot.date}
              onChange={(e) => setNewClosedSlot((s) => ({ ...s, date: e.target.value }))}
              className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
            />
            <select
              value={newClosedSlot.slot}
              onChange={(e) => setNewClosedSlot((s) => ({ ...s, slot: e.target.value }))}
              className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
            >
              {SLOT_LABELS.map((slot) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
            <input
              value={newClosedSlot.reason}
              onChange={(e) => setNewClosedSlot((s) => ({ ...s, reason: e.target.value }))}
              placeholder="Причина"
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
            />
            <button onClick={addClosedSlot} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              + Добавить
            </button>
          </div>
          {closedSlotError && <p className="mb-3 text-xs text-red-500">{closedSlotError}</p>}
          {closedSlots.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">Закрытых интервалов пока нет.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {closedSlots.map((s) => (
                <span key={s.id} className="flex items-center gap-2 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-200">
                  {s.closed_date} · {s.slot_label}
                  {s.reason ? ` — ${s.reason}` : ""}
                  <button onClick={() => removeClosedSlot(s.id)} className="text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
      )}

      {mainTab === "catalog" && (
      <section className="space-y-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">Товары и наличие</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {availableCount} из {activeProducts.length} в наличии сегодня
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={autoFillTags}
                disabled={autoFilling}
                className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                {autoFilling ? "Заполняю…" : "✨ Автозаполнить по названию"}
              </button>
              <button
                onClick={resetAvailability}
                className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Сбросить всё на сегодня
              </button>
            </div>
          </div>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Зелёная рамка = приехало сегодня, на сайте покажется «Doručíme dnes». Остальные позиции —
            «Doručíme zítra». Фото под товаром — это стикер, который клиент собирает после покупки.
            Автозаполнение угадывает тип/цвет/высоту по названию только у товаров-охапок и только там,
            где поле ещё пустое — заполненное вручную не трогает.
          </p>
          {autoFillResult && (
            <p className="mb-3 rounded-md bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
              {autoFillResult}
            </p>
          )}

          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveTab("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                activeTab === "all" ? "bg-accent text-white" : "border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              Все ({activeProducts.length})
            </button>
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c.value}
                onClick={() => setActiveTab(c.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                  activeTab === c.value ? c.color : "text-zinc-500 dark:text-zinc-400 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {c.label} ({products.filter((p) => !p.archived && p.category === c.value).length})
              </button>
            ))}
            <button
              onClick={() => setActiveTab("archive")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                activeTab === "archive" ? "bg-zinc-700 text-white" : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              🗄 Архив ({archivedCount})
            </button>
          </div>

          <input
            value={availabilitySearch}
            onChange={(e) => setAvailabilitySearch(e.target.value)}
            placeholder="Поиск по названию…"
            className="mb-3 w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {activeTab !== "archive" && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 p-2">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Новый товар</p>
                <input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Название"
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-1.5 py-1 text-[11px]"
                />
                <select
                  value={newProductCategory}
                  onChange={(e) => setNewProductCategory(e.target.value)}
                  title="Категория — лучше выбрать сразу, чтобы товар везде вёл себя правильно (рецепт, соответствие с поставщиком)"
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-1.5 py-1 text-[11px]"
                >
                  <option value="">Категория…</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <label className="cursor-pointer truncate rounded-md border border-zinc-300 dark:border-zinc-600 px-1.5 py-1 text-center text-[10px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  {newProductFile ? newProductFile.name : "Фото (необязательно)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setNewProductFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  onClick={addProduct}
                  disabled={!newProductName.trim() || addingProduct}
                  className="rounded-md bg-accent px-2 py-1.5 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {addingProduct ? "Добавляю…" : "+ Добавить"}
                </button>
                {addProductError && <p className="text-[10px] text-red-600 dark:text-red-400">{addProductError}</p>}
              </div>
            )}

            {sortedProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                isAvailable={availableToday.has(p.name)}
                uploadingId={uploadingId}
                recipe={recipes.filter((r) => r.bouquet_sticker_id === p.id)}
                rawMaterials={rawMaterialOptions}
                onAddRecipeItem={addRecipeItem}
                onRemoveRecipeItem={removeRecipeItem}
                onSetOrderUnitSize={setOrderUnitSize}
                onSetVaseLife={setVaseLife}
                onToggleAvailable={toggleAvailable}
                onSetCategory={setCategory}
                onToggleFlowerType={toggleFlowerType}
                onToggleColor={toggleColor}
                onSetHeight={setHeight}
                onToggleFragrant={toggleFragrant}
                onUploadImage={uploadStickerImage}
                onToggleSpecialOrder={toggleSpecialOrder}
                onToggleManualHide={toggleManualHide}
                onToggleArchived={toggleArchived}
                onSetBadge={setBadge}
                onAddDelivery={addDelivery}
              />
            ))}
          </div>
          {uploadError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{uploadError}</p>}
          {filteredProducts.length === 0 && (
            <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">Ничего не найдено.</p>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
