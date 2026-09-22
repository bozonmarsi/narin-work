"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { parseLineItems, type OrderLite } from "../warehouse/OrderAssembleModal";
import { Modal } from "../warehouse/Modal";
import { FloristRequestsPanel } from "./FloristRequestsPanel";

// Поиск и заказ у Van Vliet (склад Praha) — вызывает Edge Functions
// vanvliet-search (только чтение) и vanvliet-order (реальная покупка).
//
// На сайте поставщика добавление в корзину необратимо — это не черновик,
// это готовое обязательство забрать и оплатить. Поэтому "Купить" всегда
// спрашивает подтверждение перед вызовом, и vanvliet-order сама требует
// confirm:true — сюда нельзя попасть случайно.

type SearchRow = { keyword: string; color: string; maxPrice: string; quantity: string; materialId: string };

type RawMaterial = { id: string; product_name: string; vanvliet_in_stock: boolean | null; vanvliet_stock_checked_at: string | null };
type Alias = { id: string; alias: string; product_sticker_id: string; is_manual?: boolean };
type Purchase = {
  id: string;
  product_name: string;
  color: string | null;
  quantity: number;
  price_per_unit: number | null;
  total_price: number | null;
  target_date: string | null;
  created_at: string;
  picked_up: boolean;
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

// У поставщика заказ идёт партиями (шаг = orderPer: 1 шт гортензии, 10
// эустомы и т.п.) — округляем вверх до ближайшего кратного шагу, а не
// разрешаем произвольное число, которое реальный заказ не примет.
function roundToStep(amount: number, step: number): number {
  const s = step > 0 ? step : 1;
  if (!(amount > 0)) return s;
  return Math.ceil(amount / s) * s;
}

type StickerLite = { id: string; product_name: string; category: string | null; order_unit_size: number; quantity: number | null };
type RecipeLite = { bouquet_sticker_id: string; ingredient_sticker_id: string; quantity_needed: number };
type QueueOrder = OrderLite & { delivery_date: string | null; status: string | null };

type OrderContribution = { orderId: string; label: string; qty: number };
type ShortfallRow = { materialId: string; neededDate: string; shortfall: number; orders: OrderContribution[] };

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
    // Кто именно заказал этот цветок на эту дату — чтобы список "К
    // заказу" читался как "нужно докупить X, его ждут заказы №..., №...",
    // а не голая цифра без причины.
    const contribByMaterial = new Map<string, Map<string, OrderContribution>>();
    function addContribution(materialId: string, order: QueueOrder, qty: number) {
      let byOrder = contribByMaterial.get(materialId);
      if (!byOrder) {
        byOrder = new Map();
        contribByMaterial.set(materialId, byOrder);
      }
      const existing = byOrder.get(order.id);
      if (existing) existing.qty += qty;
      else
        byOrder.set(order.id, {
          orderId: order.order_id || "—",
          label: decodeHtmlEntities(order.recipient_name || order.customer_name || "—"),
          qty,
        });
    }

    for (const order of ordersByDate.get(date) ?? []) {
      for (const item of parseLineItems(order)) {
        const sticker = findSticker(item.rawName, item.name);
        if (!sticker) continue;
        if (sticker.category === "ohapka") {
          const qty = item.quantity * sticker.order_unit_size;
          needMap.set(sticker.id, (needMap.get(sticker.id) ?? 0) + qty);
          addContribution(sticker.id, order, qty);
          continue;
        }
        for (const r of recipes.filter((r) => r.bouquet_sticker_id === sticker.id)) {
          const qty = r.quantity_needed * item.quantity;
          needMap.set(r.ingredient_sticker_id, (needMap.get(r.ingredient_sticker_id) ?? 0) + qty);
          addContribution(r.ingredient_sticker_id, order, qty);
        }
      }
    }
    for (const [materialId, needed] of needMap.entries()) {
      const available = availableByMaterial.get(materialId) ?? 0;
      const used = Math.min(available, needed);
      availableByMaterial.set(materialId, available - used);
      const shortfall = needed - used;
      if (shortfall > 0) {
        const orders = Array.from(contribByMaterial.get(materialId)?.values() ?? []).sort((a, b) => b.qty - a.qty);
        rows.push({ materialId, neededDate: date, shortfall, orders });
      }
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

// "3 ч назад" / "вчера" — чтобы устаревшую проверку было видно сразу в
// списке, а не только по наведению на каждый бейдж отдельно.
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  return days === 1 ? "вчера" : `${days} дн назад`;
}

type SupplyStatus = "available" | "unavailable" | "pending" | "unmatched";

function supplyStatusFor(material: RawMaterial, aliasCount: number): SupplyStatus {
  if (aliasCount === 0) return "unmatched";
  if (!material.vanvliet_stock_checked_at) return "pending";
  return material.vanvliet_in_stock ? "available" : "unavailable";
}

const SUPPLY_STATUS_STYLE: Record<SupplyStatus, string> = {
  available: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  unavailable: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  pending: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  unmatched: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const SUPPLY_STATUS_ICON: Record<SupplyStatus, string> = {
  available: "✓",
  unavailable: "✗",
  pending: "…",
  unmatched: "?",
};

// supabase-js only gives a generic "non-2xx status code" message by default —
// the actual error body (which step failed, what the supplier's API said) is
// on error.context (a Response). Without this we're debugging blind.
// Известные "step" из наших vanvliet-* функций — своя человеческая
// фраза вместо сырого дампа ответа Anthropic/upstream API, который
// пользователю ничего не говорит и просто пугает на экране.
const FUNCTION_STEP_MESSAGES: Record<string, string> = {
  anthropic_refusal:
    "Модель отказалась разбирать сегодняшний прайс-лист (ложное срабатывание защиты на список названий цветов) — соответствия не обновились. Обычно помогает попробовать ещё раз через пару минут.",
  anthropic: "Не получилось обратиться к модели распознавания — попробуй ещё раз через пару минут.",
  parse: "Модель прислала ответ, который не удалось разобрать — попробуй обновить ещё раз.",
};

async function describeFunctionError(err: unknown): Promise<string> {
  const context = (err as { context?: Response })?.context;
  if (context && typeof context.text === "function") {
    try {
      const text = await context.text();
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.step === "string" && FUNCTION_STEP_MESSAGES[parsed.step]) {
          return FUNCTION_STEP_MESSAGES[parsed.step];
        }
        if (typeof parsed?.message === "string") return parsed.message;
        if (typeof parsed?.error === "string") return parsed.error;
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
  // По умолчанию "Завтра", не "Сегодня" — заказ у поставщика имеет смысл
  // на дату, на которую реально будем собирать/доставлять, а не на
  // сегодня (сегодняшний остаток уже либо есть у нас, либо взять негде).
  const [targetDate, setTargetDate] = useState(DATE_OPTIONS[1].value);
  const [results, setResults] = useState<ResultGroup[] | null>(null);
  // Параллельно results — для какой позиции (какой materialId) был этот
  // результат, чтобы знать, куда сохранять "Запомнить соответствие".
  const [resultMaterialIds, setResultMaterialIds] = useState<string[]>([]);
  const [catalogSize, setCatalogSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<Record<string, boolean>>({});
  // Ручная правка количества прямо на карточке — по умолчанию берём
  // предложенный минимум партии у поставщика, но можно взять и больше
  // (кратно шагу заказа: 10 эустом, 20, 30…, а не только ровно 10).
  const [cartAmounts, setCartAmounts] = useState<Record<string, number>>({});

  // Журнал того, что уже реально куплено у Van Vliet (пишет сама функция
  // vanvliet-order при успехе) — чтобы видеть, чего и на какую дату ждать,
  // не заходя каждый раз на сайт поставщика.
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  async function loadPurchases() {
    const supabase = createClient();
    const { data } = await supabase
      .from("vanvliet_purchases")
      .select("id, product_name, color, quantity, price_per_unit, total_price, target_date, created_at, picked_up")
      .order("target_date", { ascending: true })
      .limit(50);
    setPurchases((data ?? []) as Purchase[]);
  }

  // Реальная логика склада: заказала сегодня — завтра с утра едешь на
  // оптовую базу и собираешь по списку. Отмечаем то, что физически
  // забрано, отдельно от самого факта заказа — забранное больше не
  // должно маячить среди "ещё надо забрать".
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  // Раньше "Наличие у поставщика" было отдельным попапом поверх экрана —
  // неудобно листать длинный список и одновременно работать с корзиной.
  // Теперь это вторая вкладка той же правой колонки, что и "Корзина".
  const [rightTab, setRightTab] = useState<"cart" | "supply" | "aliases">("cart");
  const [markingPickedUp, setMarkingPickedUp] = useState<string | null>(null);
  const pendingPickup = purchases.filter((p) => !p.picked_up);

  async function markPickedUp(id: string) {
    setMarkingPickedUp(id);
    try {
      const supabase = createClient();
      await supabase.from("vanvliet_purchases").update({ picked_up: true, picked_up_at: new Date().toISOString() }).eq("id", id);
      await loadPurchases();
    } finally {
      setMarkingPickedUp(null);
    }
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
    prunedMaterials: number;
    genusRejected: number;
    report: { name: string; aliases: string[] }[];
  } | null>(null);
  const [scanningStock, setScanningStock] = useState(false);
  const [stockScanError, setStockScanError] = useState<string | null>(null);

  // Ручное добавление соответствия менеджером — с подсказками из ЖИВОГО
  // каталога Van Vliet (не голый текст), чтобы не вписать несуществующее
  // название. Каталог грузится один раз, когда открывается попап.
  const [vvCatalogNames, setVvCatalogNames] = useState<string[]>([]);
  const [loadingVvCatalog, setLoadingVvCatalog] = useState(false);
  const [manualProductId, setManualProductId] = useState("");
  const [manualAliasText, setManualAliasText] = useState("");
  const manualAliasInputRef = useRef<HTMLInputElement>(null);
  const [removingAliasId, setRemovingAliasId] = useState<string | null>(null);

  async function loadVvCatalogNames() {
    setLoadingVvCatalog(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.functions.invoke("vanvliet-search", {
        body: { fullCatalog: true, targetDate: pragueDate(0) },
      });
      const names: string[] = (data?.catalog ?? []).map((c: { product: string }) => c.product);
      setVvCatalogNames(Array.from(new Set(names)).sort());
    } finally {
      setLoadingVvCatalog(false);
    }
  }

  async function removeAlias(id: string) {
    setRemovingAliasId(id);
    try {
      const supabase = createClient();
      await supabase.from("product_name_aliases").delete().eq("id", id);
      setAliases((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setRemovingAliasId(null);
    }
  }

  async function addManualAlias() {
    const text = manualAliasText.trim();
    if (!manualProductId || !text) return;
    await rememberAlias(manualProductId, text);
    setManualAliasText("");
    // Товар остаётся выбранным — сразу можно вписывать следующее
    // название для того же цветка, не выбирая его заново.
    manualAliasInputRef.current?.focus();
  }

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

  // Каталог для подсказок в ручной форме — грузим только когда попап
  // реально открыт, не при каждой загрузке страницы.
  useEffect(() => {
    if (rightTab === "aliases" && vvCatalogNames.length === 0 && !loadingVvCatalog) {
      loadVvCatalogNames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab]);

  async function loadMaterials() {
    const supabase = createClient();
    const [supplierRes, materialsRes] = await Promise.all([
      supabase.from("suppliers").select("id").eq("name", "Van Vliet").maybeSingle(),
      supabase
        .from("product_stickers")
        .select("id, product_name, vanvliet_in_stock, vanvliet_stock_checked_at")
        .eq("category", "ohapka")
        .eq("archived", false)
        .order("product_name"),
    ]);
    const supplierId = supplierRes.data?.id ?? null;
    setVanVlietSupplierId(supplierId);
    setMaterials(materialsRes.data ?? []);
    if (supplierId) {
      const { data } = await supabase
        .from("product_name_aliases")
        .select("id, alias, product_sticker_id, is_manual")
        .eq("supplier_id", supplierId);
      setAliases(data ?? []);
    }
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  // Остаток у Van Vliet проставляет сканер (vanvliet-stock-scan) дважды в
  // день — бейдж в панели должен обновиться сам, без перезагрузки.
  useRealtimeRefresh("product_stickers", loadMaterials);
  // Соответствие добавили руками, через ИИ или "Запомнить" в поиске —
  // бейджи и списки должны обновиться сами, без перезагрузки страницы.
  useRealtimeRefresh("product_name_aliases", loadMaterials);

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
        // Подтверждено человеком (клик "Запомнить" в поиске или ручная
        // форма) — автопрогон ИИ такое больше не трогает и не стирает.
        is_manual: true,
      });
      if (!insertErr) {
        setAliases((prev) => [...prev, { id: key, alias, product_sticker_id: materialId }]);
      }
    } finally {
      setSavingAlias(null);
    }
  }

  // Ручной запуск сканера остатков (та же функция, что дважды в день
  // запускает pg_cron) — не ждать до 07:00/17:00, чтобы проверить
  // прямо сейчас.
  async function scanStock() {
    setScanningStock(true);
    setStockScanError(null);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("vanvliet-stock-scan", { body: {} });
      if (fnError) throw fnError;
      if (data?.ok === false) throw new Error(data.step ? `${data.step}: ${JSON.stringify(data.body)}` : data.error);
      await loadMaterials();
    } catch (e) {
      setStockScanError(await describeFunctionError(e));
    } finally {
      setScanningStock(false);
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
        prunedMaterials: data.prunedMaterials ?? 0,
        genusRejected: data.genusRejected ?? 0,
        report: data.report ?? [],
      });

      if (vanVlietSupplierId) {
        const { data: refreshed } = await supabase
          .from("product_name_aliases")
          .select("id, alias, product_sticker_id, is_manual")
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

  // Выбор из своего списка и ручной ввод названия — два независимых
  // способа сказать, что искать, а не связка "выбери И обязательно
  // допиши". Несколько алиасов на один свой цветок — это нормально (у
  // поставщика может быть несколько подходящих товаров), поэтому
  // раскрываем строку во ВСЕ известные алиасы сразу + вручную введённую
  // фразу, если она есть. Если у выбранного цветка ещё нет ни одного
  // сохранённого алиаса — ищем хотя бы по его собственному названию,
  // чтобы выбор из списка сам по себе уже был достаточен для поиска.
  function phrasesForRow(row: SearchRow): string[] {
    const known = row.materialId ? aliases.filter((a) => a.product_sticker_id === row.materialId).map((a) => a.alias) : [];
    const manual = row.keyword.trim();
    const set = new Set(known);
    if (manual) set.add(manual);
    if (set.size === 0 && row.materialId) {
      const material = materials.find((m) => m.id === row.materialId);
      if (material) set.add(decodeHtmlEntities(material.product_name));
    }
    return Array.from(set);
  }

  // rowsOverride — для бейджа "Наличие у поставщика": клик на
  // несопоставленный цветок ищет его сразу, минуя ручной выбор в форме
  // (передаёт свежую строку напрямую, а не через состояние `rows`, у
  // которого React иначе не успел бы обновиться к этому же вызову).
  async function search(rowsOverride?: SearchRow[]) {
    const activeRows = rowsOverride ?? rows;
    setError(null);
    setResults(null);
    setCatalogSize(null);

    // expanded: один элемент на каждую фразу-алиас; rowIndex указывает,
    // к какой строке формы (и, значит, к какому materialId) её потом
    // приплюсовать обратно после ответа сервера.
    const expanded: { rowIndex: number; phrase: string }[] = [];
    activeRows.forEach((row, rowIndex) => {
      for (const phrase of phrasesForRow(row)) expanded.push({ rowIndex, phrase });
    });

    if (!expanded.length) {
      setError("Добавь хотя бы одну позицию");
      return;
    }

    const requests = expanded.map(({ phrase, rowIndex }) => ({
      label: phrase,
      keywords: phrase.toLowerCase().split(/\s+/).filter(Boolean),
      colors: activeRows[rowIndex].color ? [activeRows[rowIndex].color] : [],
      maxPrice: activeRows[rowIndex].maxPrice ? Number(activeRows[rowIndex].maxPrice) : null,
      quantity: activeRows[rowIndex].quantity ? Number(activeRows[rowIndex].quantity) : null,
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
      activeRows.forEach((row, rowIndex) => {
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

  // Клик "Искать →" у несопоставленного цветка в блоке "Наличие у
  // поставщика" — заполняет форму этим товаром и сразу ищет, чтобы не
  // делать это руками через выпадающий список.
  function searchForMaterial(materialId: string) {
    const row: SearchRow = { ...emptyRow(), materialId };
    setRows([row]);
    search([row]);
  }

  async function buy(candidate: Candidate, requestLabel: string, date: string, materialId: string | null, amount: number) {
    const key = `${requestLabel}:${candidate.cartProductKey}`;
    const total = candidate.price * amount;
    if (
      !confirm(
        `Заказать «${candidate.product}» — ${amount} шт за ${total} Kč на ${date}?\n\nЭто реальная покупка у поставщика, отменить нельзя.`
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
          cartAmount: amount,
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

  const supplyRows = materials.map((m) => {
    const materialAliases = aliases.filter((a) => a.product_sticker_id === m.id);
    return { m, status: supplyStatusFor(m, materialAliases.length), aliasNames: materialAliases.map((a) => a.alias) };
  });
  const supplyAttentionCount = supplyRows.filter((r) => r.status === "unmatched" || r.status === "unavailable").length;

  return (
    <>
    <div className="grid items-start gap-4 md:grid-cols-2">
    <div className="order-2 mb-4 space-y-3 md:order-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Van Vliet — поиск и заказ (Praha)</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPickupModalOpen(true)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:border-accent hover:text-accent dark:border-zinc-600 dark:text-zinc-400"
          >
            📦 Забрать со склада{pendingPickup.length > 0 ? ` (${pendingPickup.length})` : ""}
          </button>
        </div>
      </div>

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
            onClick={() => search()}
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
              <div key={key} className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                {row.orders.length > 0 && (
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Нужно для:{" "}
                    {row.orders
                      .map((o) => `№${o.orderId} (${o.label}${o.qty !== row.shortfall ? `, ${o.qty} шт` : ""})`)
                      .join(", ")}
                  </p>
                )}
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

    <div className="order-1 space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700 md:order-2 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
      <div className="sticky top-0 -mt-3 -mx-3 rounded-t-lg bg-white px-3 pt-3 pb-3 dark:bg-zinc-900">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          <button
            onClick={() => setRightTab("cart")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              rightTab === "cart"
                ? "bg-white text-accent shadow-sm dark:bg-zinc-700 dark:text-accent"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            🛒 Корзина
          </button>
          <button
            onClick={() => setRightTab("supply")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              rightTab === "supply"
                ? "bg-white text-accent shadow-sm dark:bg-zinc-700 dark:text-accent"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            📊 Наличие{supplyAttentionCount > 0 ? ` (${supplyAttentionCount})` : ""}
          </button>
          <button
            onClick={() => setRightTab("aliases")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              rightTab === "aliases"
                ? "bg-white text-accent shadow-sm dark:bg-zinc-700 dark:text-accent"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            🔗 Соответствия
          </button>
        </div>
      </div>
      {rightTab === "cart" ? (
      <>
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
                    const step = c.orderPer || 1;
                    const amount = cartAmounts[key] ?? c.cartAmount;
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
                        <div className="mt-1 flex items-center gap-1">
                          <button
                            onClick={() => setCartAmounts((p) => ({ ...p, [key]: Math.max(step, amount - step) }))}
                            className="rounded border border-zinc-300 px-1.5 leading-5 text-zinc-500 hover:border-accent hover:text-accent dark:border-zinc-600"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={amount}
                            min={step}
                            step={step}
                            onChange={(e) => setCartAmounts((p) => ({ ...p, [key]: Number(e.target.value) || step }))}
                            onBlur={() => setCartAmounts((p) => ({ ...p, [key]: roundToStep(amount, step) }))}
                            className="w-12 rounded border border-zinc-300 bg-transparent px-1 py-0.5 text-center outline-none focus:border-accent dark:border-zinc-600"
                          />
                          <button
                            onClick={() => setCartAmounts((p) => ({ ...p, [key]: amount + step }))}
                            className="rounded border border-zinc-300 px-1.5 leading-5 text-zinc-500 hover:border-accent hover:text-accent dark:border-zinc-600"
                          >
                            +
                          </button>
                          <span className="text-zinc-400">шт (партия {step})</span>
                        </div>
                        <p className="mt-1">
                          {c.price} Kč × {amount} = <b>{c.price * amount} Kč</b>
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
                          onClick={() => buy(c, group.request, group.date, materialId || null, roundToStep(amount, step))}
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
        {pendingPickup.length === 0 ? (
          <p className="text-xs text-zinc-400">Пока ничего не куплено (или всё уже забрано со склада).</p>
        ) : (
          pendingPickup.map((p) => (
            <div key={p.id} className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700">
              <span className="font-medium">{p.product_name}</span>
              {p.color && <span className="text-zinc-400"> · {p.color}</span>} — {p.quantity} шт
              {p.total_price != null && <> за {p.total_price} Kč</>}
              {p.target_date && <> на {p.target_date}</>}
            </div>
          ))
        )}
      </div>
      </>
      ) : rightTab === "supply" ? (
      <div className="space-y-3">
        <button
          onClick={scanStock}
          disabled={scanningStock}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:border-accent hover:text-accent disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
        >
          {scanningStock ? "Проверяю остаток…" : "📡 Проверить остаток у Van Vliet"}
        </button>

        {stockScanError && <p className="text-xs text-red-500">{stockScanError}</p>}

        <p className="text-xs text-zinc-400">
          Дважды в день бот сам проверяет остаток у поставщика по уже сохранённым названиям (вкладка
          «Соответствия»). Точность зависит от качества подбора — <b>серый «?»</b> не значит «нет цветка», это
          значит «нет надёжного названия для проверки».
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
          <span>✓ есть у поставщика</span>
          <span>✗ нет у поставщика</span>
          <span>… алиас есть, ждём первой проверки</span>
          <span>? не сопоставлено</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {supplyRows
            .slice()
            .sort((a, b) => {
              const order: Record<SupplyStatus, number> = { unmatched: 0, unavailable: 1, pending: 2, available: 3 };
              if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
              return a.m.product_name.localeCompare(b.m.product_name);
            })
            .map(({ m, status, aliasNames }) => (
              <span
                key={m.id}
                title={
                  aliasNames.length > 0
                    ? `Ищем как: ${aliasNames.join(", ")}${
                        m.vanvliet_stock_checked_at ? ` · проверено: ${new Date(m.vanvliet_stock_checked_at).toLocaleString("ru-RU")}` : ""
                      }`
                    : "Нет сохранённого названия у поставщика для этого цветка"
                }
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${SUPPLY_STATUS_STYLE[status]}`}
              >
                {SUPPLY_STATUS_ICON[status]} {decodeHtmlEntities(m.product_name)}
                {status !== "unmatched" && m.vanvliet_stock_checked_at && (
                  <span className="text-[10px] opacity-70">· {relativeTime(m.vanvliet_stock_checked_at)}</span>
                )}
                {status === "unmatched" && (
                  <button
                    onClick={() => {
                      setRightTab("cart");
                      searchForMaterial(m.id);
                    }}
                    className="ml-0.5 underline decoration-dotted hover:text-accent"
                  >
                    Искать →
                  </button>
                )}
              </span>
            ))}
        </div>
      </div>
      ) : (
      <div className="space-y-3">
        <button
          onClick={refreshAliases}
          disabled={refreshingAliases}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:border-accent hover:text-accent disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
        >
          {refreshingAliases ? "Обновляю соответствия (может занять минуту)…" : "🔄 Обновить соответствия (AI)"}
        </button>

        <div className="space-y-1.5 rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
          <p className="text-xs font-medium">Добавить соответствие вручную</p>
          <div className="flex flex-wrap gap-1.5">
            <select
              value={manualProductId}
              onChange={(e) => setManualProductId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            >
              <option value="">Наш товар…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {decodeHtmlEntities(m.product_name)}
                </option>
              ))}
            </select>
            <input
              ref={manualAliasInputRef}
              value={manualAliasText}
              onChange={(e) => setManualAliasText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addManualAlias();
                }
              }}
              list="vv-catalog-names"
              placeholder={loadingVvCatalog ? "Загружаю каталог поставщика…" : "Начни вводить — подскажет реальные названия, Enter — добавить"}
              className="min-w-0 flex-[2] rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
            />
            <datalist id="vv-catalog-names">
              {vvCatalogNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button
              onClick={addManualAlias}
              disabled={!manualProductId || !manualAliasText.trim() || savingAlias === `${manualProductId}:${manualAliasText.trim()}`}
              className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
          <p className="text-[11px] text-zinc-400">
            Список подсказок — реальные товары из сегодняшнего каталога Van Vliet ({vvCatalogNames.length || "…"}).
            Можно вписать и своё название, если его там нет.
          </p>
        </div>

        <p className="text-xs text-zinc-400">
          Как это работает: раз в неделю по вторникам (или кнопкой «🔄 Обновить соответствия» выше) ИИ подбирает,
          под каким названием наш цветок продаётся у Van Vliet — вручную вписанное или подтверждённое (✋) он
          больше не трогает.
        </p>

        <div className="space-y-1">
          <p className="text-xs font-medium">Все соответствия ({aliases.length})</p>
          {aliases.length === 0 ? (
            <p className="text-xs text-zinc-400">Пока ничего не сохранено.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {aliases
                .slice()
                .sort((a, b) => {
                  const nameA = materials.find((m) => m.id === a.product_sticker_id)?.product_name ?? "";
                  const nameB = materials.find((m) => m.id === b.product_sticker_id)?.product_name ?? "";
                  return nameA.localeCompare(nameB);
                })
                .map((a) => {
                  const material = materials.find((m) => m.id === a.product_sticker_id);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
                    >
                      <span className="truncate">
                        <span className="font-medium">{material ? decodeHtmlEntities(material.product_name) : "—"}</span>
                        <span className="text-zinc-400"> → «{a.alias}»</span>
                        {a.is_manual && (
                          <span title="Подтверждено человеком — ИИ это больше не тронет" className="ml-1 text-emerald-500">
                            ✋
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => removeAlias(a.id)}
                        disabled={removingAliasId === a.id}
                        className="shrink-0 text-zinc-400 hover:text-red-500 disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {refreshResult && (
          <div className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
            <p>
              Обновлено: {refreshResult.updatedMaterials} цветов, {refreshResult.totalAliases} соответствий.
              {refreshResult.prunedMaterials > 0 && (
                <> Убрано устаревших/неточных: {refreshResult.prunedMaterials} (сейчас нет уверенного совпадения — честно пусто, а не старое неверное).</>
              )}
              {refreshResult.genusRejected > 0 && (
                <> Отклонено защитой от неверного рода: {refreshResult.genusRejected}.</>
              )}
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
      </div>
      )}
    </div>
    </div>

    {pickupModalOpen && (
      <Modal title="Забрать со склада" onClose={() => setPickupModalOpen(false)}>
        <p className="mb-3 text-xs text-zinc-400">
          Отметь то, что реально забрала на оптовой базе — исчезнет из списка "Что уже заказано".
        </p>
        {pendingPickup.length === 0 ? (
          <p className="text-sm text-zinc-400">Забирать пока нечего — всё уже собрано.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(
              pendingPickup.reduce<Record<string, Purchase[]>>((acc, p) => {
                const key = p.target_date ?? "без даты";
                (acc[key] ??= []).push(p);
                return acc;
              }, {})
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, items]) => (
                <div key={date}>
                  <p className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{date}</p>
                  <div className="space-y-1">
                    {items.map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={markingPickedUp === p.id}
                          onChange={() => markPickedUp(p.id)}
                          className="h-4 w-4 shrink-0 accent-accent"
                        />
                        <span>
                          <span className="font-medium">{p.product_name}</span>
                          {p.color && <span className="text-zinc-400"> · {p.color}</span>} — {p.quantity} шт
                          {p.total_price != null && <> за {p.total_price} Kč</>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Modal>
    )}

    </>
  );
}
