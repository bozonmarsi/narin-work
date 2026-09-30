"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../../layout";
import type { Category, Line, Plan, SubscriptionSettings, SubscriptionSize, Tier } from "../types";

const SIZES: SubscriptionSize[] = ["small", "medium", "large"];
const SIZE_LETTER: Record<SubscriptionSize, string> = { small: "S", medium: "M", large: "L" };
const BUCKET = "subscription-images";

const DEFAULT_SETTINGS: SubscriptionSettings = {
  id: 1,
  moods: ["Romantická", "Jasná", "Pastelová", "Divoká", "Klasická", "Minimalistická", "Luxusní"],
  mood_enabled: true,
  exclusions_enabled: true,
  vase_enabled: true,
  vase_min_deliveries: 4,
};

// уникальный суффикс имени файла (вызывается только при загрузке, не при рендере)
function uniqueSuffix() {
  return Date.now().toString(36);
}

const input = "rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1 text-sm";
const card = "rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3";
const btnPrimary = "rounded-md bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50";
const btnGhost =
  "rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40";

export default function SubscriptionCatalogPage() {
  const { profile } = useDashboard();

  const [categories, setCategories] = useState<Category[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [settings, setSettings] = useState<SubscriptionSettings>(DEFAULT_SETTINGS);
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newLineDraft, setNewLineDraft] = useState({ category_id: "", name: "", description: "" });
  const [newMood, setNewMood] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [catRes, lineRes, planRes, tierRes, setRes] = await Promise.all([
      supabase.from("subscription_categories").select("*").order("sort_order"),
      supabase.from("subscription_lines").select("*").order("sort_order"),
      supabase.from("subscription_plans").select("*"),
      supabase.from("subscription_frequency_tiers").select("*").order("deliveries_per_cycle"),
      supabase.from("subscription_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    const firstError = [catRes, lineRes, planRes, tierRes].find((r) => r.error)?.error;
    if (firstError) setError(firstError.message);
    setCategories(catRes.data ?? []);
    setLines(lineRes.data ?? []);
    setPlans(planRes.data ?? []);
    setTiers(tierRes.data ?? []);
    if (setRes.error || !setRes.data) setSettingsMissing(true);
    else {
      setSettingsMissing(false);
      setSettings(setRes.data as SubscriptionSettings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flashSaved(key: string) {
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1400);
  }

  // Любое сохранение: показываем ошибку, а не молча "Сохранено ✓"
  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, reload = false) {
    setBusyKey(key);
    setError(null);
    const { error: err } = await fn();
    setBusyKey(null);
    if (err) {
      setError(err.message);
      return false;
    }
    flashSaved(key);
    if (reload) load();
    return true;
  }

  function saveCategory(cat: Category) {
    return run(`cat-${cat.id}`, () =>
      createClient().from("subscription_categories").update({ name: cat.name, description: cat.description, active: cat.active }).eq("id", cat.id),
    );
  }

  function saveLine(line: Line) {
    return run(`line-${line.id}`, () =>
      createClient()
        .from("subscription_lines")
        .update({ name: line.name, description: line.description, category_id: line.category_id, active: line.active })
        .eq("id", line.id),
    );
  }

  async function addLine() {
    if (!newLineDraft.category_id || !newLineDraft.name.trim()) {
      setError("Выберите категорию и впишите название линейки.");
      return;
    }
    const ok = await run(
      "new-line",
      () =>
        createClient()
          .from("subscription_lines")
          .insert({
            category_id: newLineDraft.category_id,
            name: newLineDraft.name.trim(),
            description: newLineDraft.description.trim() || null,
            sort_order: lines.length,
          }),
      true,
    );
    if (ok) setNewLineDraft({ category_id: "", name: "", description: "" });
  }

  function savePlan(lineId: string, size: SubscriptionSize, price: number, active: boolean) {
    const existing = plans.find((p) => p.line_id === lineId && p.size === size);
    const supabase = createClient();
    return run(
      `plan-${lineId}-${size}`,
      () =>
        existing
          ? supabase.from("subscription_plans").update({ price_per_delivery: price, active }).eq("id", existing.id)
          : supabase.from("subscription_plans").insert({ line_id: lineId, size, price_per_delivery: price, active }),
      true,
    );
  }

  function saveTier(tier: Tier) {
    return run(`tier-${tier.deliveries_per_cycle}`, () =>
      createClient()
        .from("subscription_frequency_tiers")
        .update({ discount_percent: tier.discount_percent, perk_text: tier.perk_text || null, active: tier.active })
        .eq("deliveries_per_cycle", tier.deliveries_per_cycle),
    );
  }

  function saveSettings(next: SubscriptionSettings) {
    setSettings(next);
    return run("settings", () =>
      createClient()
        .from("subscription_settings")
        .upsert({ ...next, id: 1, updated_at: new Date().toISOString() }),
    );
  }

  // Порядок на сайте: меняем sort_order местами с соседом
  async function move(table: "subscription_categories" | "subscription_lines", list: (Category | Line)[], index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[index];
    const supabase = createClient();
    // нормализуем порядок (у старых записей sort_order мог совпадать)
    const ordered = list.map((x, i) => ({ id: x.id, sort_order: i }));
    ordered[index].sort_order = j;
    ordered[j].sort_order = index;
    await run(
      `move-${a.id}`,
      async () => {
        for (const o of ordered) {
          const { error: err } = await supabase.from(table).update({ sort_order: o.sort_order }).eq("id", o.id);
          if (err) return { error: err };
        }
        return { error: null };
      },
      true,
    );
  }

  async function uploadImage(kind: "category" | "line", id: string, file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Это не картинка.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Фото больше 8 МБ — уменьшите его, пожалуйста (для сайта хватит 1600 px по длинной стороне).");
      return;
    }
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    // новое имя при каждой загрузке — иначе браузеры клиентов долго показывают старое фото из кэша
    const path = `${kind}/${id}-${uniqueSuffix()}.${ext}`;
    const key = `img-${id}`;
    setBusyKey(key);
    setError(null);
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "31536000", upsert: false });
    if (upErr) {
      setBusyKey(null);
      setError("Не удалось загрузить фото: " + upErr.message);
      return;
    }
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await run(
      key,
      () =>
        kind === "category"
          ? supabase.from("subscription_categories").update({ hero_image_url: url }).eq("id", id)
          : supabase.from("subscription_lines").update({ image_url: url }).eq("id", id),
      true,
    );
  }

  function removeImage(kind: "category" | "line", id: string) {
    const supabase = createClient();
    return run(
      `img-${id}`,
      () =>
        kind === "category"
          ? supabase.from("subscription_categories").update({ hero_image_url: null }).eq("id", id)
          : supabase.from("subscription_lines").update({ image_url: null }).eq("id", id),
      true,
    );
  }

  if (profile?.role !== "manager") return null;
  if (loading) return <p className="text-zinc-500 dark:text-zinc-400">Загрузка…</p>;

  const activeLinesIn = (catId: string) => lines.filter((l) => l.category_id === catId && l.active);
  const lineHasPrice = (lineId: string) => plans.some((p) => p.line_id === lineId && p.active && p.price_per_delivery > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Каталог подписок</h1>
        <Link href="/dashboard/subscriptions" className="text-sm text-accent hover:underline">
          ← Назад к подпискам
        </Link>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Всё на этой странице сразу видно клиентам на сайте в конструкторе подписки (тексты — по-чешски). Выключенное
        («показывать» без галочки) на сайте не показывается и не может быть оплачено. Уже оформленные подписки это не
        меняет.
      </p>

      {error && (
        <p className="sticky top-2 z-10 rounded-md bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}{" "}
          <button onClick={() => setError(null)} className="ml-2 underline">
            закрыть
          </button>
        </p>
      )}

      {/* ---------- Категории ---------- */}
      <section className="space-y-3">
        <div>
          <p className="font-medium">1. Категории</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Первый шаг конструктора. Если в категории нет ни одной включённой линейки, клиент увидит её серой с надписью
            «Připravujeme».
          </p>
        </div>
        <div className="space-y-2">
          {categories.map((cat, i) => {
            const empty = activeLinesIn(cat.id).length === 0;
            return (
              <div key={cat.id} className={`${card} flex flex-wrap items-start gap-3`}>
                <ImagePicker
                  url={cat.hero_image_url}
                  busy={busyKey === `img-${cat.id}`}
                  onPick={(f) => uploadImage("category", cat.id, f)}
                  onRemove={() => removeImage("category", cat.id)}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={cat.name}
                      onChange={(e) => setCategories((cs) => cs.map((c, j) => (j === i ? { ...c, name: e.target.value } : c)))}
                      className={`${input} w-40`}
                    />
                    <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <input
                        type="checkbox"
                        checked={cat.active}
                        onChange={(e) => setCategories((cs) => cs.map((c, j) => (j === i ? { ...c, active: e.target.checked } : c)))}
                      />
                      показывать
                    </label>
                    {cat.active && empty && <span className="text-xs text-amber-600 dark:text-amber-400">нет включённых линеек → «Připravujeme»</span>}
                    <span className="ml-auto flex gap-1">
                      <button className={btnGhost} disabled={i === 0} onClick={() => move("subscription_categories", categories, i, -1)} aria-label="Выше">
                        ↑
                      </button>
                      <button
                        className={btnGhost}
                        disabled={i === categories.length - 1}
                        onClick={() => move("subscription_categories", categories, i, 1)}
                        aria-label="Ниже"
                      >
                        ↓
                      </button>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={cat.description ?? ""}
                      onChange={(e) => setCategories((cs) => cs.map((c, j) => (j === i ? { ...c, description: e.target.value } : c)))}
                      placeholder="Описание (видит клиент)"
                      className={`${input} min-w-0 flex-1`}
                    />
                    <button onClick={() => saveCategory(cat)} disabled={busyKey === `cat-${cat.id}`} className={btnPrimary}>
                      {savedKey === `cat-${cat.id}` ? "Сохранено ✓" : "Сохранить"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Линейки ---------- */}
      <section className="space-y-3">
        <div>
          <p className="font-medium">2. Линейки, фото и цены (Kč за одну доставку)</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Карточки во втором шаге. Размер без галочки клиент не сможет выбрать. Фото лучше горизонтальное 4:3.
          </p>
        </div>
        <div className="space-y-2">
          {lines.map((line, i) => {
            const catForLine = categories.find((c) => c.id === line.category_id);
            return (
              <div key={line.id} className={`${card} space-y-2 ${line.active ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <ImagePicker
                    url={line.image_url}
                    busy={busyKey === `img-${line.id}`}
                    onPick={(f) => uploadImage("line", line.id, f)}
                    onRemove={() => removeImage("line", line.id)}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={line.category_id ?? ""}
                        onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, category_id: e.target.value } : l)))}
                        className={input}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={line.name}
                        onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)))}
                        className={`${input} w-40`}
                      />
                      <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <input
                          type="checkbox"
                          checked={line.active}
                          onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, active: e.target.checked } : l)))}
                        />
                        показывать
                      </label>
                      {line.active && !lineHasPrice(line.id) && <span className="text-xs text-amber-600 dark:text-amber-400">нет ни одной цены</span>}
                      {catForLine && !catForLine.active && <span className="text-xs text-zinc-400">категория выключена</span>}
                      <span className="ml-auto flex gap-1">
                        <button className={btnGhost} disabled={i === 0} onClick={() => move("subscription_lines", lines, i, -1)} aria-label="Выше">
                          ↑
                        </button>
                        <button
                          className={btnGhost}
                          disabled={i === lines.length - 1}
                          onClick={() => move("subscription_lines", lines, i, 1)}
                          aria-label="Ниже"
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={line.description ?? ""}
                        onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))}
                        placeholder="Описание (видит клиент)"
                        className={`${input} min-w-0 flex-1`}
                      />
                      <button onClick={() => saveLine(line)} disabled={busyKey === `line-${line.id}`} className={btnPrimary}>
                        {savedKey === `line-${line.id}` ? "Сохранено ✓" : "Сохранить"}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                  {SIZES.map((size) => {
                    const plan = plans.find((p) => p.line_id === line.id && p.size === size);
                    return (
                      <PriceInput
                        key={size}
                        label={SIZE_LETTER[size]}
                        value={plan?.price_per_delivery ?? 0}
                        active={plan ? plan.active : false}
                        exists={!!plan}
                        saved={savedKey === `plan-${line.id}-${size}`}
                        busy={busyKey === `plan-${line.id}-${size}`}
                        onSave={(price, active) => savePlan(line.id, size, price, active)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 p-3">
          <select value={newLineDraft.category_id} onChange={(e) => setNewLineDraft((d) => ({ ...d, category_id: e.target.value }))} className={input}>
            <option value="">Категория…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={newLineDraft.name}
            onChange={(e) => setNewLineDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Новая линейка"
            className={`${input} w-40`}
          />
          <input
            value={newLineDraft.description}
            onChange={(e) => setNewLineDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Описание"
            className={`${input} min-w-0 flex-1`}
          />
          <button onClick={addLine} className={btnGhost}>
            + Добавить линейку
          </button>
        </div>
      </section>

      {/* ---------- Частота ---------- */}
      <section className="space-y-3">
        <div>
          <p className="font-medium">3. Сколько доставок за 4 недели</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Варианты с галочкой клиент видит в конструкторе. Если в бонусе есть слово «sekáčky», рядом появится иконка
            ножниц, «certifikát» — иконка сертификата.
          </p>
        </div>
        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <div key={tier.deliveries_per_cycle} className={`${card} flex flex-wrap items-center gap-2`}>
              <span className="w-10 text-sm font-medium">{tier.deliveries_per_cycle}×</span>
              <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                скидка
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={tier.discount_percent}
                  onChange={(e) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, discount_percent: Number(e.target.value) } : t)))}
                  className={`${input} w-16`}
                />
                %
              </label>
              <input
                value={tier.perk_text ?? ""}
                onChange={(e) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, perk_text: e.target.value } : t)))}
                placeholder="Подарок, по-чешски (необязательно)"
                className={`${input} min-w-0 flex-1`}
              />
              <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={tier.active}
                  onChange={(e) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, active: e.target.checked } : t)))}
                />
                показывать
              </label>
              <button onClick={() => saveTier(tier)} disabled={busyKey === `tier-${tier.deliveries_per_cycle}`} className={btnPrimary}>
                {savedKey === `tier-${tier.deliveries_per_cycle}` ? "Сохранено ✓" : "Сохранить"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Настройки конструктора ---------- */}
      <section className="space-y-3">
        <div>
          <p className="font-medium">4. Дополнительные вопросы в конструкторе</p>
          {settingsMissing && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Таблица настроек ещё не создана — выполните SQL из миграции 20260930000000_subscription_manager_controls. До
              этого сайт использует стандартные значения.
            </p>
          )}
        </div>
        <div className={`${card} space-y-4`}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.mood_enabled} onChange={(e) => saveSettings({ ...settings, mood_enabled: e.target.checked })} />
              Спрашивать настроение
            </label>
            {settings.mood_enabled && (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                {settings.moods.map((m, i) => (
                  <span key={m + i} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-sm">
                    {m}
                    <button
                      onClick={() => saveSettings({ ...settings, moods: settings.moods.filter((_, j) => j !== i) })}
                      className="text-zinc-400 hover:text-red-500"
                      aria-label={`Убрать ${m}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={newMood}
                  onChange={(e) => setNewMood(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newMood.trim()) {
                      saveSettings({ ...settings, moods: [...settings.moods, newMood.trim()] });
                      setNewMood("");
                    }
                  }}
                  placeholder="+ настроение, по-чешски"
                  className={`${input} w-48`}
                />
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.exclusions_enabled} onChange={(e) => saveSettings({ ...settings, exclusions_enabled: e.target.checked })} />
            Спрашивать «Co určitě nechcete vidět» (какие цветы не привозить)
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.vase_enabled} onChange={(e) => saveSettings({ ...settings, vase_enabled: e.target.checked })} />
              Предлагать «Výměna váz» (обмен ваз)
            </label>
            {settings.vase_enabled && (
              <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                от
                <select
                  value={settings.vase_min_deliveries}
                  onChange={(e) => saveSettings({ ...settings, vase_min_deliveries: Number(e.target.value) })}
                  className={input}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                доставок за 4 недели
              </label>
            )}
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{savedKey === "settings" ? "Сохранено ✓" : "Сохраняется сразу при изменении."}</p>
        </div>
      </section>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Рабочие дни и закрытые даты магазина — на отдельной странице, раздел{" "}
        <Link href="/dashboard/shop" className="text-accent hover:underline">
          Магазин
        </Link>
        . В закрытые дни клиент не может назначить доставку.
      </p>
    </div>
  );
}

function ImagePicker({
  url,
  busy,
  onPick,
  onRemove,
}: {
  url: string | null;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex w-28 shrink-0 flex-col items-center gap-1">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-20 w-28 rounded-md object-cover" />
      ) : (
        <div className="flex h-20 w-28 items-center justify-center rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 text-center text-[11px] leading-tight text-zinc-400">
          нет фото
          <br />
          (на сайте — временное)
        </div>
      )}
      <div className="flex gap-1">
        <label className={`${btnGhost} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "…" : url ? "Заменить" : "Загрузить"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPick(f);
            }}
          />
        </label>
        {url && (
          <button className={btnGhost} onClick={onRemove} disabled={busy} aria-label="Убрать фото">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function PriceInput({
  label,
  value,
  active,
  exists,
  saved,
  busy,
  onSave,
}: {
  label: string;
  value: number;
  active: boolean;
  exists: boolean;
  saved: boolean;
  busy: boolean;
  onSave: (price: number, active: boolean) => void;
}) {
  const [val, setVal] = useState(String(value));
  useEffect(() => setVal(String(value)), [value]);
  return (
    <div className={`flex items-center gap-1 text-xs ${active ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-500"}`}>
      <label className="flex items-center gap-1" title="Показывать этот размер клиентам">
        <input type="checkbox" checked={active} disabled={busy} onChange={(e) => onSave(Number(val) || 0, e.target.checked)} />
        <span className="w-3 font-medium">{label}</span>
      </label>
      <input
        type="number"
        min={0}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-20 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
      />
      <button onClick={() => onSave(Number(val) || 0, exists ? active : true)} disabled={busy} className={btnGhost}>
        {saved ? "✓" : "Kč"}
      </button>
    </div>
  );
}
