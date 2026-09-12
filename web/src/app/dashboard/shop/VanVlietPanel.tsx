"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { parseLineItems, type OrderLite } from "../warehouse/OrderAssembleModal";
import { FloristRequestsPanel } from "./FloristRequestsPanel";

// Поиск и заказ у Van Vliet (склад Praha) — вызывает Edge Functions
// vanvliet-search (только чтение) и vanvliet-order (реальная покупка).
//
// На сайте поставщика добавление в корзину необратимо — это не черновик,
// это готовое обязательство забрать и оплатить. Поэтому "Купить" всегда
// спрашивает подтверждение перед вызовом, и vanvliet-order сама требует
// confirm:true — сюда нельзя попасть случайно.

type SearchRow = { keyword: string; color: string; maxPrice: string; quantity: string; materialId: string };

type RawMaterial = { id: string; product_name: string };
type Alias = { id: string; alias: string; product_sticker_id: string };
type Purchase = {
  id: string;
  product_name: string;
  color: string | null;
  quantity: number;
  price_per_unit: number | null;
  total_price: number | null;
  target_date: string | null;
  created_at: string;
};

type Candidate = {
  product: string;
  color: string;
  quality: string;
  price: number;
  stock: number;
  grower: string;
  photo: string;
  orderPer: number;
  cartProductKey: number;
  cartAmount: number;
};

type ResultGroup = {
  request: string;
  requestedQuantity: number | null;
  quantityWasUnspecified: boolean;
  candidates: Candidate[];
  date: string;
};

const COLOR_OPTIONS = ["White", "Pink", "Red", "Orange", "Yellow", "Purple", "Blue", "Green", "Creme", "Black"];

// Названия у Van Vliet меняются день ото дня в части высоты/веса/партии
// ("60cm", "38gram", "10st", "(imp)", "(10)") — сам цветок при этом тот
// же. Сохраняем алиас БЕЗ этого хвоста, чтобы он не переставал совпадать
// при малейшем изменении на сайте поставщика.
function coreName(name: string): string {
  return name
    .replace(/\(\s*imp\s*\)/gi, " ")
    .replace(/\(\s*\d+\s*\)/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*cm\b/gi, " ")
    .replace(/\b\d+([.,]\d+)?\s*gram\b/gi, " ")
    .replace(/\b\d+\s*st\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const emptyRow = (): SearchRow => ({ keyword: "", color: "", maxPrice: "", quantity: "", materialId: "" });

type StickerLite = { id: string; product_name: string; category: string | null; order_unit_size: number; quantity: number | null };
type RecipeLite = { bouquet_sticker_id: string; ingredient_sticker_id: string; quantity_needed: number };
type QueueOrder = OrderLite & { delivery_date: string | null; status: string | null };

type ShortfallRow = { materialId: string; neededDate: string; shortfall: number };

// Заказы в этих статусах ещё не собраны — их стебли ещё не списаны из
// batches/product_stickers.quantity (списание происходит только при
// подтверждении сборки, см. OrderAssembleModal). Более поздние статусы
// (assembled и дальше) уже реально забрали своё из остатка, второй раз
// их считать нельзя.
const NOT_YET_ASSEMBLED_STATUSES = ["new", "confirmed", "courier_assigned", "assembling"];

// Та же логика, что и при сборке одного заказа (OrderAssembleModal), но
// по всем ещё не собранным заказам сразу — чтобы увидеть дефицит
// заранее, а не в момент, когда флорист уже стоит и собирает букет.
function computeShortfalls(orders: QueueOrder[], stickers: StickerLite[], recipes: RecipeLite[]): ShortfallRow[] {
  function findSticker(rawName: string, decodedName: string) {
    return stickers.find((s) => s.product_name === rawName) ?? stickers.find((s) => decodeHtmlEntities(s.product_name) === decodedName);
  }

  const ordersByDate = new Map<string, QueueOrder[]>();
  for (const order of orders) {
    const date = order.delivery_date;
    if (!date) continue;
    const list = ordersByDate.get(date) ?? [];
    list.push(order);
    ordersByDate.set(date, list);
  }
  const dates = Array.from(ordersByDate.keys()).sort();

  // Текущий остаток по каждому сырью — расходуется по датам от ближайшей
  // к дальней, а не заново на каждую дату, иначе один и тот же остаток
  // "покроет" сразу несколько разных дней вместо одного.
  const availableByMaterial = new Map(
    stickers.filter((s) => s.category === "ohapka").map((s) => [s.id, s.quantity ?? 0])
  );

  const rows: ShortfallRow[] = [];
  for (const date of dates) {
    const needMap = new Map<string, number>();
    for (const order of ordersByDate.get(date) ?? []) {
      for (const item of parseLineItems(order)) {
        const sticker = findSticker(item.rawName, item.name);
        if (!sticker) continue;
        if (sticker.category === "ohapka") {
          needMap.set(sticker.id, (needMap.get(sticker.id) ?? 0) + item.quantity * sticker.order_unit_size);
          continue;
        }
        for (const r of recipes.filter((r) => r.bouquet_sticker_id === sticker.id)) {
          needMap.set(r.ingredient_sticker_id, (needMap.get(r.ingredient_sticker_id) ?? 0) + r.quantity_needed * item.quantity);
        }
      }
    }
    for (const [materialId, needed] of needMap.entries()) {
      const available = availableByMaterial.get(materialId) ?? 0;
      const used = Math.min(available, needed);
      availableByMaterial.set(materialId, available - used);
      const shortfall = needed - used;
      if (shortfall > 0) rows.push({ materialId, neededDate: date, shortfall });
    }
  }
  return rows;
}

// Дата в пражском часовом поясе, +offsetDays дней от сегодня, как "YYYY-MM-DD".
function pragueDate(offsetDays: number): string {
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  const d = new Date(`${todayStr}T12:00:00`); // полдень — подальше от границ DST
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

const DATE_OPTIONS = [
  { label: "Сегодня", value: pragueDate(0) },
  { label: "Завтра", value: pragueDate(1) },
  { label: "Послезавтра", value: pragueDate(2) },
  { label: "Через 3 дня", value: pragueDate(3) },
];

// supabase-js only gives a generic "non-2xx status code" message by default —
// the actual error body (which step failed, what the supplier's API said) is
// on error.context (a Response). Without this we're debugging blind.
async function describeFunctionError(err: unknown): Promise<string> {
  const context = (err as { context?: Response })?.context;
  if (context && typeof context.text === "function") {
    try {
      const text = await context.text();
      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed);
      } catch {
        return text || String(err);
      }
    } catch {
      // fall through
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function VanVlietPanel() {
  const [rows, setRows] = useState<SearchRow[]>([emptyRow()]);
  const [targetDate, setTargetDate] = useState(DATE_OPTIONS[0].value);
  const [results, setResults] = useState<ResultGroup[] | null>(null);
  // Параллельно results — для какой позиции (какой materialId) был этот
  // результат, чтобы знать, куда сохранять "Запомнить соответствие".
  const [resultMaterialIds, setResultMaterialIds] = useState<string[]>([]);
  const [catalogSize, setCatalogSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<Record<string, boolean>>({});

  // Журнал того, что уже реально куплено у Van Vliet (пишет сама функция
  // vanvliet-order при успехе) — чтобы видеть, чего и на какую дату ждать,
  // не заходя каждый раз на сайт поставщика.
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  async function loadPurchases() {
    const supabase = createClient();
    const { data } = await supabase
      .from("vanvliet_purchases")
      .select("id, product_name, color, quantity, price_per_unit, total_price, target_date, created_at")
      .order("target_date", { ascending: true })
      .limit(50);
    setPurchases((data ?? []) as Purchase[]);
  }

  useEffect(() => {
    loadPurchases();
  }, []);

  useRealtimeRefresh("vanvliet_purchases", loadPurchases);

  // Свой каталог сырья + уже сохранённые соответствия "как называет Van
  // Vliet" → "какой это наш цветок" (та же таблица, что и во вкладке
  // "Алиасы" на складе — просто переиспользуем её здесь для поиска).
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [vanVlietSupplierId, setVanVlietSupplierId] = useState<string | null>(null);
  const [savingAlias, setSavingAlias] = useState<string | null>(null);
  const [refreshingAliases, setRefreshingAliases] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{
    updatedMaterials: number;
    totalAliases: number;
    report: { name: string; aliases: string[] }[];
  } | null>(null);

  // Авто-расчёт "что закончится под ещё не собранные заказы" — считается
  // на лету при каждом изменении заказов/остатков, не хранится (иначе
  // протухнет так же, как раньше протухали алиасы).
  const [shortfalls, setShortfalls] = useState<ShortfallRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [searchingQueueKey, setSearchingQueueKey] = useState<string | null>(null);

  async function loadShortfalls() {
    setQueueLoading(true);
    const supabase = createClient();
    const [ordersRes, stickersRes, recipesRes] = await Promise.all([
      supabase
        .from("tilda_orders")
        .select("id, order_id, customer_name, recipient_name, products_text, raw_payload, delivery_date, status")
        .in("status", NOT_YET_ASSEMBLED_STATUSES),
      supabase.from("product_stickers").select("id, product_name, category, order_unit_size, quantity"),
      supabase.from("product_recipes").select("bouquet_sticker_id, ingredient_sticker_id, quantity_needed"),
    ]);
    setShortfalls(
      computeShortfalls((ordersRes.data ?? []) as QueueOrder[], stickersRes.data ?? [], recipesRes.data ?? [])
    );
    setQueueLoading(false);
  }

  useEffect(() => {
    loadShortfalls();
  }, []);

  useRealtimeRefresh("tilda_orders", loadShortfalls);
  useRealtimeRefresh("product_stickers", loadShortfalls);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [supplierRes, materialsRes] = await Promise.all([
        supabase.from("suppliers").select("id").eq("name", "Van Vliet").maybeSingle(),
        supabase
          .from("product_stickers")
          .select("id, product_name")
          .eq("category", "ohapka")
          .order("product_name"),
      ]);
      const supplierId = supplierRes.data?.id ?? null;
      setVanVlietSupplierId(supplierId);
      setMaterials(materialsRes.data ?? []);
      if (supplierId) {
        const { data } = await supabase
          .from("product_name_aliases")
          .select("id, alias, product_sticker_id")
          .eq("supplier_id", supplierId);
        setAliases(data ?? []);
      }
    })();
  }, []);

  function aliasFor(materialId: string): string | undefined {
    return aliases.find((a) => a.product_sticker_id === materialId)?.alias;
  }

  async function rememberAlias(materialId: string, productName: string) {
    if (!vanVlietSupplierId) return;
    const key = `${materialId}:${productName}`;
    const alias = coreName(productName);
    setSavingAlias(key);
    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase.from("product_name_aliases").insert({
        supplier_id: vanVlietSupplierId,
        alias,
        product_sticker_id: materialId,
      });
      if (!insertErr) {
        setAliases((prev) => [...prev, { id: key, alias, product_sticker_id: materialId }]);
      }
    } finally {
      setSavingAlias(null);
    }
  }

  // Настоящее (AI) обновление соответствий: серверная функция сама
  // скачивает сегодняшний каталог Van Vliet и просит Claude сопоставить
  // его с нашими названиями — по роду/виду И цвету, не по случайным
  // буквам. Полностью заменяет алиасы для каждого цветка, который попал
  // в её ответ. То же самое раз в полмесяца делает pg_cron — это ручной
  // запуск того же самого, когда нужно обновить прямо сейчас.
  async function refreshAliases() {
    setRefreshingAliases(true);
    setRefreshResult(null);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("vanvliet-alias-refresh", { body: {} });
      if (fnError) throw fnError;
      if (data?.ok === false) {
        throw new Error(data.step ? `${data.step}: ${JSON.stringify(data.body ?? data.raw)}` : data.error);
      }

      setRefreshResult({
        updatedMaterials: data.updatedMaterials ?? 0,
        totalAliases: data.totalAliases ?? 0,
        report: data.report ?? [],
      });

      if (vanVlietSupplierId) {
        const { data: refreshed } = await supabase
          .from("product_name_aliases")
          .select("id, alias, product_sticker_id")
          .eq("supplier_id", vanVlietSupplierId);
        setAliases(refreshed ?? []);
      }
    } catch (e) {
      setError(await describeFunctionError(e));
    } finally {
      setRefreshingAliases(false);
    }
  }

  // Кнопка на строке дефицита — ищет по уже сохранённым алиасам этого
  // цветка сразу на нужную дату и добавляет результат к тем же карточкам
  // "Купить" сверху, что и обычный ручной поиск.
  async function searchForShortfall(row: ShortfallRow) {
    const material = materials.find((m) => m.id === row.materialId);
    if (!material) return;
    const phrases = aliases.filter((a) => a.product_sticker_id === row.materialId).map((a) => a.alias);
    if (!phrases.length) {
      setError(
        `Нет сохранённых соответствий для «${decodeHtmlEntities(material.product_name)}» — сначала обнови соответствия или найди вручную`
      );
      return;
    }
    const key = `${row.materialId}:${row.neededDate}`;
    setSearchingQueueKey(key);
    setError(null);
    try {
      const supabase = createClient();
      const requests = phrases.map((phrase) => ({
        label: phrase,
        keywords: phrase.toLowerCase().split(/\s+/).filter(Boolean),
        colors: [],
        maxPrice: null,
        quantity: row.shortfall,
      }));
      const { data, error: fnError } = await supabase.functions.invoke("vanvliet-search", {
        body: { requests, targetDate: row.neededDate },
      });
      if (fnError) throw fnError;
      if (data?.ok === false) throw new Error(data.step ? `${data.step}: ${JSON.stringify(data.body)}` : data.error);

      const rawResults: ResultGroup[] = data.results ?? [];
      const byKey = new Map<number, Candidate>();
      for (const part of rawResults) for (const c of part.candidates) if (!byKey.has(c.cartProductKey)) byKey.set(c.cartProductKey, c);

      const merged: ResultGroup = {
        request: decodeHtmlEntities(material.product_name),
        requestedQuantity: row.shortfall,
        quantityWasUnspecified: false,
        candidates: Array.from(byKey.values()),
        date: row.neededDate,
      };
      setResults((prev) => [merged, ...(prev ?? [])]);
      setResultMaterialIds((prev) => [row.materialId, ...(prev ?? [])]);
    } catch (e) {
      setError(await describeFunctionError(e));
    } finally {
      setSearchingQueueKey(null);
    }
  }

  function updateRow(i: number, patch: Partial<SearchRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Несколько алиасов на один свой цветок — это нормально (у поставщика
  // может быть несколько подходящих товаров), поэтому раскрываем строку
  // во ВСЕ известные алиасы сразу + вручную введённую фразу, если она
  // отличается, а не только в первый найденный.
  function phrasesForRow(row: SearchRow): string[] {
    const known = row.materialId ? aliases.filter((a) => a.product_sticker_id === row.materialId).map((a) => a.alias) : [];
    const manual = row.keyword.trim();
    const set = new Set(known);
    if (manual) set.add(manual);
    return Array.from(set);
  }

  async function search() {
    setError(null);
    setResults(null);
    setCatalogSize(null);

    // expanded: один элемент на каждую фразу-алиас; rowIndex указывает,
    // к какой строке формы (и, значит, к какому materialId) её потом
    // приплюсовать обратно после ответа сервера.
    const expanded: { rowIndex: number; phrase: string }[] = [];
    rows.forEach((row, rowIndex) => {
      for (const phrase of phrasesForRow(row)) expanded.push({ rowIndex, phrase });
    });

    if (!expanded.length) {
      setError("Добавь хотя бы одну позицию");
      return;
    }

    const requests = expanded.map(({ phrase, rowIndex }) => ({
      label: phrase,
      keywords: phrase.toLowerCase().split(/\s+/).filter(Boolean),
      colors: rows[rowIndex].color ? [rows[rowIndex].color] : [],
      maxPrice: rows[rowIndex].maxPrice ? Number(rows[rowIndex].maxPrice) : null,
      quantity: rows[rowIndex].quantity ? Number(rows[rowIndex].quantity) : null,
    }));

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("vanvliet-search", {
        body: { requests, targetDate },
      });

      if (fnError) throw fnError;
      if (data?.ok === false) {
        throw new Error(data.step ? `${data.step}: ${JSON.stringify(data.body)}` : data.error);
      }

      const rawResults: ResultGroup[] = data.results;

      // Схлопываем результаты по всем алиасам одной строки обратно в одну
      // карточку — с дедупликацией по cartProductKey (один и тот же
      // товар мог найтись сразу по нескольким алиасам).
      const merged: ResultGroup[] = [];
      const mergedMaterialIds: string[] = [];
      rows.forEach((row, rowIndex) => {
        const parts = rawResults.filter((_, i) => expanded[i].rowIndex === rowIndex);
        if (!parts.length) return;
        const byKey = new Map<number, Candidate>();
        for (const part of parts) {
          for (const c of part.candidates) {
            if (!byKey.has(c.cartProductKey)) byKey.set(c.cartProductKey, c);
          }
        }
        const material = row.materialId ? materials.find((m) => m.id === row.materialId) : undefined;
        merged.push({
          request: material ? decodeHtmlEntities(material.product_name) : parts[0].request,
          requestedQuantity: parts[0].requestedQuantity,
          quantityWasUnspecified: parts[0].quantityWasUnspecified,
          candidates: Array.from(byKey.values()),
          date: parts[0].date,
        });
        mergedMaterialIds.push(row.materialId);
      });

      setResults(merged);
      setResultMaterialIds(mergedMaterialIds);
      setCatalogSize(typeof data.catalogSize === "number" ? data.catalogSize : null);
    } catch (e) {
      setError(await describeFunctionError(e));
    } finally {
      setLoading(false);
    }
  }

  async function buy(candidate: Candidate, requestLabel: string, date: string, materialId: string | null) {
    const key = `${requestLabel}:${candidate.cartProductKey}`;
    const total = candidate.price * candidate.cartAmount;
    if (
      !confirm(
        `Заказать «${candidate.product}» — ${candidate.cartAmount} шт за ${total} Kč на ${date}?\n\nЭто реальная покупка у поставщика, отменить нельзя.`
      )
    ) {
      return;
    }

    setOrdering(key);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("vanvliet-order", {
        body: {
          cartProductKey: candidate.cartProductKey,
          cartAmount: candidate.cartAmount,
          targetDate: date,
          confirm: true,
          productName: candidate.product,
          color: candidate.color,
          price: candidate.price,
          materialId,
        },
      });
      if (fnError) throw fnError;
      if (data?.ok === false) throw new Error(JSON.stringify(data.body || data.error));
      setOrdered((p) => ({ ...p, [key]: true }));
    } catch (e) {
      alert("Не удалось заказать: " + (await describeFunctionError(e)));
    } finally {
      setOrdering(null);
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Van Vliet — поиск и заказ (Praha)</p>
        <button
          onClick={refreshAliases}
          disabled={refreshingAliases}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:border-accent hover:text-accent disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
        >
          {refreshingAliases ? "Обновляю соответствия (может занять минуту)…" : "🔄 Обновить соответствия (AI)"}
        </button>
      </div>

      {refreshResult && (
        <div className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
          <p>
            Обновлено: {refreshResult.updatedMaterials} цветов, {refreshResult.totalAliases} соответствий.
          </p>
          {refreshResult.report.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-zinc-500 dark:text-zinc-400">
              {refreshResult.report.map((r) => (
                <li key={r.name}>
                  {decodeHtmlEntities(r.name)}: {r.aliases.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {DATE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTargetDate(opt.value)}
            className={`rounded-md border px-2 py-1 text-xs ${
              targetDate === opt.value
                ? "border-accent bg-accent text-white"
                : "border-zinc-300 text-zinc-600 hover:border-accent dark:border-zinc-600 dark:text-zinc-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <select
              value={row.materialId}
              onChange={(e) => updateRow(i, { materialId: e.target.value })}
              className="max-w-[9rem] rounded-md border border-zinc-300 bg-transparent px-1 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            >
              <option value="">свой товар…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {decodeHtmlEntities(m.product_name)}
                  {aliasFor(m.id) ? " ✓" : ""}
                </option>
              ))}
            </select>
            <input
              value={row.keyword}
              onChange={(e) => updateRow(i, { keyword: e.target.value })}
              placeholder="Что нужно (напр. hortenz)"
              className="w-36 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            />
            <select
              value={row.color}
              onChange={(e) => updateRow(i, { color: e.target.value })}
              className="rounded-md border border-zinc-300 bg-transparent px-1 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            >
              <option value="">любой цвет</option>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={row.maxPrice}
              onChange={(e) => updateRow(i, { maxPrice: e.target.value })}
              placeholder="до Kč"
              type="number"
              className="w-16 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            />
            <input
              value={row.quantity}
              onChange={(e) => updateRow(i, { quantity: e.target.value })}
              placeholder="шт"
              type="number"
              className="w-14 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            />
            {rows.length > 1 && (
              <button onClick={() => removeRow(i)} className="text-xs text-zinc-400 hover:text-red-500">
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={addRow} className="text-xs text-accent hover:underline">
            + ещё позиция
          </button>
          <button
            onClick={search}
            disabled={loading}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {loading ? "Ищу…" : "Искать"}
          </button>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <p className="text-sm font-medium">К заказу (по ещё не собранным заказам)</p>
        {queueLoading ? (
          <p className="text-xs text-zinc-400">Считаю…</p>
        ) : shortfalls.length === 0 ? (
          <p className="text-xs text-zinc-400">Дефицита не видно — на всё хватает остатка.</p>
        ) : (
          shortfalls.map((row) => {
            const material = materials.find((m) => m.id === row.materialId);
            const key = `${row.materialId}:${row.neededDate}`;
            return (
              <div
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700"
              >
                <span>
                  <span className="font-medium">{material ? decodeHtmlEntities(material.product_name) : "—"}</span> — не хватает{" "}
                  {row.shortfall} на {row.neededDate}
                </span>
                <button
                  onClick={() => searchForShortfall(row)}
                  disabled={searchingQueueKey === key}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-500 hover:border-accent hover:text-accent disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
                >
                  {searchingQueueKey === key ? "…" : "Искать у Van Vliet"}
                </button>
              </div>
            );
          })
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {catalogSize != null && (
        <p className="text-xs text-zinc-400">Каталог на {targetDate}: {catalogSize} товаров</p>
      )}

      <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <FloristRequestsPanel showForm={false} />
      </div>
    </div>

    <div className="lg:sticky lg:top-4 space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <p className="text-sm font-medium">🛒 Корзина</p>
      {!results || results.length === 0 ? (
        <p className="text-xs text-zinc-400">
          Пусто — найди что-нибудь слева (вручную или кнопкой «Искать у Van Vliet» из списка «К заказу»).
        </p>
      ) : (
        <div className="space-y-3">
          {results.map((group, groupIndex) => {
            const materialId = resultMaterialIds[groupIndex];
            return (
            <div key={group.request}>
              <p className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {group.request}
                {group.quantityWasUnspecified && <span className="text-zinc-400"> (количество не указано)</span>}
              </p>
              {group.candidates.length === 0 ? (
                <p className="text-xs text-zinc-400">Ничего не найдено</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {group.candidates.map((c) => {
                    const key = `${group.request}:${c.cartProductKey}`;
                    const aliasKey = materialId ? `${materialId}:${c.product}` : null;
                    const alreadyAliased =
                      materialId && aliases.some((a) => a.product_sticker_id === materialId && a.alias === coreName(c.product));
                    return (
                      <div key={key} className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
                        {c.photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.photo}
                            alt={c.product}
                            className="mb-1 h-36 w-full rounded bg-zinc-100 object-contain dark:bg-zinc-800"
                          />
                        )}
                        <p className="font-medium leading-tight">{c.product}</p>
                        <p className="text-zinc-500 dark:text-zinc-400">
                          {c.color} · {c.quality} · {c.grower || "—"}
                        </p>
                        <p className="mt-1">
                          {c.price} Kč × {c.cartAmount} = <b>{c.price * c.cartAmount} Kč</b>
                        </p>
                        <p className="text-zinc-400">на складе: {c.stock}</p>
                        {materialId && (
                          <button
                            onClick={() => rememberAlias(materialId, c.product)}
                            disabled={Boolean(alreadyAliased) || savingAlias === aliasKey}
                            className="mt-1 w-full rounded-md border border-zinc-300 py-1 text-zinc-500 hover:border-accent hover:text-accent disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
                          >
                            {alreadyAliased ? "🔗 Уже запомнено" : savingAlias === aliasKey ? "…" : "🔗 Запомнить соответствие"}
                          </button>
                        )}
                        <button
                          onClick={() => buy(c, group.request, group.date, materialId || null)}
                          disabled={ordering === key || ordered[key]}
                          className="mt-1.5 w-full rounded-md bg-accent px-2 py-1 text-white disabled:opacity-50"
                        >
                          {ordered[key] ? "Заказано ✓" : ordering === key ? "…" : "Купить"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      <div className="space-y-1.5 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <p className="text-sm font-medium">🧾 Что уже заказано</p>
        {purchases.length === 0 ? (
          <p className="text-xs text-zinc-400">Пока ничего не куплено.</p>
        ) : (
          purchases.map((p) => (
            <div key={p.id} className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700">
              <span className="font-medium">{p.product_name}</span>
              {p.color && <span className="text-zinc-400"> · {p.color}</span>} — {p.quantity} шт
              {p.total_price != null && <> за {p.total_price} Kč</>}
              {p.target_date && <> на {p.target_date}</>}
            </div>
          ))
        )}
      </div>
    </div>
    </div>
  );
}
