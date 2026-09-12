"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";

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

// Чешская основа слова (без учёта рода: -ý/-á/-é) -> английский цвет,
// как его отдаёт Van Vliet. Нужно для автосопоставления: имя нашего
// сырья обычно "Род + чешский цвет" ("Allium fialový"), а у поставщика
// цвет уже структурирован отдельным полем на английском.
const CZ_COLOR_STEMS: [string, string][] = [
  ["fialov", "Purple"],
  ["fialk", "Purple"],
  ["růžov", "Pink"],
  ["ruzov", "Pink"],
  ["červen", "Red"],
  ["cerven", "Red"],
  ["bíl", "White"],
  ["bil", "White"],
  ["žlut", "Yellow"],
  ["zlut", "Yellow"],
  ["oranžov", "Orange"],
  ["oranzov", "Orange"],
  ["modr", "Blue"],
  ["zelen", "Green"],
  ["čern", "Black"],
  ["cern", "Black"],
  ["krémov", "Creme"],
  ["kremov", "Creme"],
  ["smetanov", "Creme"],
];

function guessColorFromName(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [stem, color] of CZ_COLOR_STEMS) {
    if (lower.includes(stem)) return color;
  }
  return null;
}

// Первое слово имени — почти всегда род цветка, который у большинства
// растений пишется одинаково что по-чешски, что по-латински/английски
// ("Allium", "Gerbera", "Dahlia"...).
function guessGenus(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

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

  // Свой каталог сырья + уже сохранённые соответствия "как называет Van
  // Vliet" → "какой это наш цветок" (та же таблица, что и во вкладке
  // "Алиасы" на складе — просто переиспользуем её здесь для поиска).
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [vanVlietSupplierId, setVanVlietSupplierId] = useState<string | null>(null);
  const [savingAlias, setSavingAlias] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchSummary, setAutoMatchSummary] = useState<{
    saved: number;
    noMatch: string[];
    ambiguous: string[];
  } | null>(null);

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

  // Автосопоставление: для каждого своего сырья без алиасов пытаемся
  // угадать род (первое слово имени) + цвет (чешская основа слова) и
  // ищем такое сочетание в живом каталоге Van Vliet. 1–5 совпадений —
  // сохраняем все сразу как алиасы (несколько — это нормально, см. выше).
  // 0 или >5 совпадений — не трогаем, оставляем на ручной поиск.
  async function autoMatchAliases() {
    if (!vanVlietSupplierId) return;
    setAutoMatching(true);
    setAutoMatchSummary(null);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("vanvliet-search", {
        body: { fullCatalog: true, targetDate },
      });
      if (fnError) throw fnError;
      if (data?.ok === false) throw new Error(data.error ?? "fullCatalog failed");

      const catalog: { product: string; color: string }[] = data.catalog ?? [];
      const unaliased = materials.filter((m) => !aliases.some((a) => a.product_sticker_id === m.id));

      const toInsert: { supplier_id: string; alias: string; product_sticker_id: string }[] = [];
      const noMatch: string[] = [];
      const ambiguous: string[] = [];

      for (const m of unaliased) {
        const name = decodeHtmlEntities(m.product_name);
        const genus = guessGenus(name);
        if (!genus) continue;
        const color = guessColorFromName(name);
        const matches = catalog.filter((c) => {
          const productLower = c.product.toLowerCase();
          if (!productLower.includes(genus)) return false;
          return !color || c.color === color;
        });
        if (matches.length === 0) {
          noMatch.push(name);
        } else if (matches.length > 5) {
          ambiguous.push(name);
        } else {
          // coreName + Set — несколько реальных товаров могут схлопнуться
          // в одно и то же "ядро" (только высота/партия разная), не нужно
          // вставлять один и тот же алиас дважды.
          const cores = new Set(matches.map((match) => coreName(match.product)));
          for (const alias of cores) {
            toInsert.push({ supplier_id: vanVlietSupplierId, alias, product_sticker_id: m.id });
          }
        }
      }

      if (toInsert.length) {
        const { error: insertErr } = await supabase.from("product_name_aliases").insert(toInsert);
        if (insertErr) throw insertErr;
        const { data: refreshed } = await supabase
          .from("product_name_aliases")
          .select("id, alias, product_sticker_id")
          .eq("supplier_id", vanVlietSupplierId);
        setAliases(refreshed ?? []);
      }

      setAutoMatchSummary({ saved: toInsert.length, noMatch, ambiguous });
    } catch (e) {
      setError(await describeFunctionError(e));
    } finally {
      setAutoMatching(false);
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

  async function buy(candidate: Candidate, requestLabel: string, date: string) {
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
        body: { cartProductKey: candidate.cartProductKey, cartAmount: candidate.cartAmount, targetDate: date, confirm: true },
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
    <div className="mb-4 space-y-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Van Vliet — поиск и заказ (Praha)</p>
        <button
          onClick={autoMatchAliases}
          disabled={autoMatching || !vanVlietSupplierId}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:border-accent hover:text-accent disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
        >
          {autoMatching ? "Сопоставляю…" : "🪄 Найти соответствия автоматически"}
        </button>
      </div>

      {autoMatchSummary && (
        <div className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
          <p>Сохранено новых соответствий: {autoMatchSummary.saved}</p>
          {autoMatchSummary.ambiguous.length > 0 && (
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              Неоднозначно (больше 5 вариантов, разберись сама через поиск): {autoMatchSummary.ambiguous.join(", ")}
            </p>
          )}
          {autoMatchSummary.noMatch.length > 0 && (
            <p className="mt-1 text-zinc-400">
              Не нашлось совпадений: {autoMatchSummary.noMatch.join(", ")}
            </p>
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

      {error && <p className="text-xs text-red-500">{error}</p>}
      {catalogSize != null && (
        <p className="text-xs text-zinc-400">Каталог на {targetDate}: {catalogSize} товаров</p>
      )}

      {results && (
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
                          onClick={() => buy(c, group.request, group.date)}
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
    </div>
  );
}
