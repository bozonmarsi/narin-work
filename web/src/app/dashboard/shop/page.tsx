"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { decodeHtmlEntities } from "@/lib/format";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type ClosedDate = { closed_date: string; reason: string | null };
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
};

const WEEKDAY_LABELS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

const CATEGORY_OPTIONS = [
  { value: "buket", label: "Букеты", color: "bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 ring-pink-200 dark:ring-pink-500/30" },
  { value: "set", label: "Сеты", color: "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-purple-200 dark:ring-purple-500/30" },
  { value: "ohapka", label: "Охапки", color: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-200 dark:ring-amber-500/30" },
  { value: "atelier", label: "Atelier", color: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/30" },
  { value: "otkrytka", label: "Открытки", color: "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 ring-teal-200 dark:ring-teal-500/30" },
];

function categoryLabel(value: string | null) {
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? null;
}

function categoryColor(value: string | null) {
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.color ?? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 ring-zinc-200 dark:ring-zinc-700";
}

// Тип цветка — отдельная ось тегов, нужна для кастомного фильтра на
// странице "Охапки" на сайте (встроенный фильтр Тильды не подошёл).
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

export default function ShopPage() {
  const { profile } = useDashboard();

  const [weeklyClosed, setWeeklyClosed] = useState<Set<number>>(new Set());
  const [closedDates, setClosedDates] = useState<ClosedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClosedDate, setNewClosedDate] = useState({ date: "", reason: "" });

  const [products, setProducts] = useState<Product[]>([]);
  const [availableToday, setAvailableToday] = useState<Set<string>>(new Set());
  const [availabilitySearch, setAvailabilitySearch] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductFile, setNewProductFile] = useState<File | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [addProductError, setAddProductError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillResult, setAutoFillResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [weeklyRes, datesRes] = await Promise.all([
      supabase.from("shop_weekly_closed_days").select("weekday"),
      supabase.from("shop_closed_dates").select("closed_date, reason").order("closed_date"),
    ]);
    setWeeklyClosed(new Set((weeklyRes.data ?? []).map((r) => r.weekday)));
    setClosedDates(datesRes.data ?? []);
    setLoading(false);
  }, []);

  const loadAvailability = useCallback(async () => {
    const supabase = createClient();
    const [productsRes, availabilityRes] = await Promise.all([
      supabase
        .from("product_stickers")
        .select("id, product_name, image_url, category, archived, special_order, flower_type, color, height")
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
        })),
    );
    setAvailableToday(new Set((availabilityRes.data ?? []).map((r) => r.product_name)));
  }, []);

  useEffect(() => {
    load();
    loadAvailability();
  }, [load, loadAvailability]);

  useRealtimeRefresh("product_availability", loadAvailability);

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

    const { error } = await supabase.from("product_stickers").insert({ id, product_name: name, image_url: imageUrl });
    if (error) {
      setAddProductError(error.message);
      setAddingProduct(false);
      return;
    }

    setNewProductName("");
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

  const activeProducts = useMemo(() => products.filter((p) => !p.archived), [products]);

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

  const availableCount = useMemo(
    () => activeProducts.filter((p) => availableToday.has(p.name)).length,
    [activeProducts, availableToday],
  );

  const archivedCount = useMemo(() => products.filter((p) => p.archived).length, [products]);

  async function toggleWeekday(day: number) {
    const supabase = createClient();
    if (weeklyClosed.has(day)) {
      await supabase.from("shop_weekly_closed_days").delete().eq("weekday", day);
    } else {
      await supabase.from("shop_weekly_closed_days").insert({ weekday: day });
    }
    load();
  }

  async function addClosedDate() {
    if (!newClosedDate.date) return;
    const supabase = createClient();
    await supabase.from("shop_closed_dates").insert({ closed_date: newClosedDate.date, reason: newClosedDate.reason.trim() || null });
    setNewClosedDate({ date: "", reason: "" });
    load();
  }

  async function removeClosedDate(date: string) {
    const supabase = createClient();
    await supabase.from("shop_closed_dates").delete().eq("closed_date", date);
    load();
  }

  if (profile?.role !== "manager") return null;
  if (loading) return <p className="text-zinc-500 dark:text-zinc-400">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Магазин</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Эти дни используются при расчёте дат доставок для подписок (нерабочие дни автоматически пропускаются).
      </p>

      <section className="space-y-3">
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
      </section>

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

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {activeTab !== "archive" && (
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 p-2.5">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Новый товар</p>
                <input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Название"
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs"
                />
                <label className="cursor-pointer truncate rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-center text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">
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
                  className="rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {addingProduct ? "Добавляю…" : "+ Добавить"}
                </button>
                {addProductError && <p className="text-[11px] text-red-600 dark:text-red-400">{addProductError}</p>}
              </div>
            )}

            {filteredProducts.map((p) => {
              const isAvailable = availableToday.has(p.name);
              const label = categoryLabel(p.category);
              return (
                <div
                  key={p.id}
                  className={`flex flex-col overflow-hidden rounded-lg border bg-white dark:bg-zinc-900 ${
                    p.archived ? "opacity-60" : isAvailable ? "border-green-300 ring-1 ring-green-200 dark:ring-green-500/30" : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  <div className="relative h-24 w-full bg-zinc-100 dark:bg-zinc-800">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-zinc-300 dark:text-zinc-600">Нет фото</div>
                    )}
                    {label && (
                      <span
                        className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${categoryColor(p.category)}`}
                      >
                        {label}
                      </span>
                    )}
                    <label
                      title="Заменить фото"
                      className="absolute right-1 top-1 cursor-pointer rounded-full bg-white/90 dark:bg-zinc-800/90 px-1.5 py-1 text-xs shadow hover:bg-white dark:hover:bg-zinc-700"
                    >
                      ✎
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadStickerImage(p.id, e.target.files[0])}
                      />
                    </label>
                    {uploadingId === p.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70 text-xs text-zinc-500 dark:text-zinc-400">
                        Загрузка…
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-2">
                    <p className="line-clamp-2 text-xs font-medium text-zinc-800 dark:text-zinc-100">{p.name}</p>
                    <select
                      value={p.category ?? ""}
                      onChange={(e) => setCategory(p.id, e.target.value)}
                      className="rounded-md border border-zinc-300 dark:border-zinc-600 px-1.5 py-1 text-[11px] text-zinc-600 dark:text-zinc-300"
                    >
                      <option value="">Без категории</option>
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {p.category === "ohapka" && (
                      <div className="flex flex-wrap gap-1">
                        {FLOWER_TYPE_OPTIONS.map((t) => {
                          const active = p.flower_type.includes(t);
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => toggleFlowerType(p.id, t)}
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
                    )}
                    {p.category === "ohapka" && (
                      <div className="flex flex-wrap gap-1">
                        {COLOR_OPTIONS.map((c) => {
                          const active = p.color.includes(c.label);
                          return (
                            <button
                              key={c.label}
                              type="button"
                              onClick={() => toggleColor(p.id, c.label)}
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
                    )}
                    {p.category === "ohapka" && (
                      <select
                        value={p.height ?? ""}
                        onChange={(e) => setHeight(p.id, e.target.value)}
                        className="rounded-md border border-zinc-300 dark:border-zinc-600 px-1.5 py-1 text-[11px] text-zinc-600 dark:text-zinc-300"
                      >
                        <option value="">Высота…</option>
                        {HEIGHT_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    )}
                    {p.special_order ? (
                      <p className="rounded-md bg-orange-50 dark:bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-600 dark:text-orange-400 ring-1 ring-inset ring-orange-200 dark:ring-orange-500/30">
                        🚚 Всегда под заказ (+2 дня)
                      </p>
                    ) : (
                      <button
                        onClick={() => toggleAvailable(p.name)}
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          isAvailable
                            ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-200 dark:ring-green-500/30"
                            : "border border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {isAvailable ? "✓ В наличии" : "Нет сегодня"}
                      </button>
                    )}
                    <div className="mt-auto flex flex-col gap-0.5">
                      <button
                        onClick={() => toggleSpecialOrder(p.id, p.special_order)}
                        className="text-left text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400"
                      >
                        {p.special_order ? "Убрать «под заказ»" : "🚚 Отметить «под заказ»"}
                      </button>
                      <button
                        onClick={() => toggleArchived(p.id, p.archived)}
                        className="text-left text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                      >
                        {p.archived ? "↩ Вернуть из архива" : "🗄 В архив"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {uploadError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{uploadError}</p>}
          {filteredProducts.length === 0 && (
            <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">Ничего не найдено.</p>
          )}
        </div>
      </section>
    </div>
  );
}
