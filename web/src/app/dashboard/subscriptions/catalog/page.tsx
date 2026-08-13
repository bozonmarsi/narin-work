"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../../layout";
import type { Category, Line, Plan, Tier } from "../types";

export default function SubscriptionCatalogPage() {
  const { profile } = useDashboard();

  const [categories, setCategories] = useState<Category[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);

  const [newLineDraft, setNewLineDraft] = useState({ category_id: "", name: "", description: "" });
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [catRes, lineRes, planRes, tierRes] = await Promise.all([
      supabase.from("subscription_categories").select("*").order("sort_order"),
      supabase.from("subscription_lines").select("*").order("sort_order"),
      supabase.from("subscription_plans").select("*"),
      supabase.from("subscription_frequency_tiers").select("*").order("deliveries_per_cycle"),
    ]);
    setCategories(catRes.data ?? []);
    setLines(lineRes.data ?? []);
    setPlans(planRes.data ?? []);
    setTiers(tierRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flashSaved(key: string) {
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 1200);
  }

  async function saveCategory(cat: Category) {
    const supabase = createClient();
    await supabase.from("subscription_categories").update({ name: cat.name, description: cat.description, active: cat.active, sort_order: cat.sort_order }).eq("id", cat.id);
    flashSaved(`cat-${cat.id}`);
  }

  async function saveLine(line: Line) {
    const supabase = createClient();
    await supabase.from("subscription_lines").update({ name: line.name, description: line.description, category_id: line.category_id, active: line.active, sort_order: line.sort_order }).eq("id", line.id);
    flashSaved(`line-${line.id}`);
  }

  async function addLine() {
    if (!newLineDraft.category_id || !newLineDraft.name.trim()) return;
    const supabase = createClient();
    await supabase.from("subscription_lines").insert({
      category_id: newLineDraft.category_id,
      name: newLineDraft.name.trim(),
      description: newLineDraft.description.trim() || null,
      sort_order: lines.length,
    });
    setNewLineDraft({ category_id: "", name: "", description: "" });
    load();
  }

  async function savePlan(lineId: string, size: "small" | "medium" | "large", price: number) {
    const supabase = createClient();
    const existing = plans.find((p) => p.line_id === lineId && p.size === size);
    if (existing) {
      await supabase.from("subscription_plans").update({ price_per_delivery: price }).eq("id", existing.id);
    } else {
      await supabase.from("subscription_plans").insert({ line_id: lineId, size, price_per_delivery: price });
    }
    flashSaved(`plan-${lineId}-${size}`);
    load();
  }

  async function saveTier(tier: Tier) {
    const supabase = createClient();
    await supabase.from("subscription_frequency_tiers").update({ discount_percent: tier.discount_percent, perk_text: tier.perk_text, active: tier.active }).eq("deliveries_per_cycle", tier.deliveries_per_cycle);
    flashSaved(`tier-${tier.deliveries_per_cycle}`);
  }

  if (profile?.role !== "manager") return null;
  if (loading) return <p className="text-zinc-500 dark:text-zinc-400">Загрузка…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Каталог подписок</h1>
        <Link href="/dashboard/subscriptions" className="text-sm text-accent hover:underline">← Назад к подпискам</Link>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Названия линеек и категорий — то, что видит клиент на сайте (по-чешски). Всё остальное на этой странице — только
        для тебя.
      </p>

      <section className="space-y-3">
        <p className="font-medium">Категории</p>
        <div className="space-y-2">
          {categories.map((cat, i) => (
            <div key={cat.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
              <input value={cat.name} onChange={(e) => setCategories((cs) => cs.map((c, j) => (j === i ? { ...c, name: e.target.value } : c)))} className="w-40 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
              <input value={cat.description ?? ""} onChange={(e) => setCategories((cs) => cs.map((c, j) => (j === i ? { ...c, description: e.target.value } : c)))} placeholder="Описание" className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
              <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <input type="checkbox" checked={cat.active} onChange={(e) => setCategories((cs) => cs.map((c, j) => (j === i ? { ...c, active: e.target.checked } : c)))} />
                активна
              </label>
              <button onClick={() => saveCategory(cat)} className="rounded-md bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover">
                {savedKey === `cat-${cat.id}` ? "Сохранено ✓" : "Сохранить"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <p className="font-medium">Линейки и цены (Kč за доставку)</p>
        <div className="space-y-2">
          {lines.map((line, i) => {
            const catForLine = categories.find((c) => c.id === line.category_id);
            return (
              <div key={line.id} className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={line.category_id ?? ""} onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, category_id: e.target.value } : l)))} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm">
                    {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <input value={line.name} onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)))} className="w-40 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
                  <input value={line.description ?? ""} onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))} placeholder="Описание" className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
                  <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <input type="checkbox" checked={line.active} onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, active: e.target.checked } : l)))} />
                    активна
                  </label>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{catForLine?.name ?? "без категории"}</span>
                  <button onClick={() => saveLine(line)} className="rounded-md bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover">
                    {savedKey === `line-${line.id}` ? "Сохранено ✓" : "Сохранить"}
                  </button>
                </div>
                <div className="flex items-center gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                  {(["small", "medium", "large"] as const).map((size) => {
                    const plan = plans.find((p) => p.line_id === line.id && p.size === size);
                    return (
                      <PriceInput
                        key={size}
                        label={size === "small" ? "S" : size === "medium" ? "M" : "L"}
                        value={plan?.price_per_delivery ?? 0}
                        saved={savedKey === `plan-${line.id}-${size}`}
                        onSave={(price) => savePlan(line.id, size, price)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 p-3">
          <select value={newLineDraft.category_id} onChange={(e) => setNewLineDraft((d) => ({ ...d, category_id: e.target.value }))} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm">
            <option value="">Категория…</option>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <input value={newLineDraft.name} onChange={(e) => setNewLineDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Новая линейка" className="w-40 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
          <input value={newLineDraft.description} onChange={(e) => setNewLineDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Описание" className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
          <button onClick={addLine} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">+ Добавить линейку</button>
        </div>
      </section>

      <section className="space-y-3">
        <p className="font-medium">Скидки за количество доставок</p>
        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <div key={tier.deliveries_per_cycle} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
              <span className="w-10 text-sm font-medium">{tier.deliveries_per_cycle}x</span>
              <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                скидка
                <input type="number" value={tier.discount_percent} onChange={(e) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, discount_percent: Number(e.target.value) } : t)))} className="w-16 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
                %
              </label>
              <input value={tier.perk_text ?? ""} onChange={(e) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, perk_text: e.target.value } : t)))} placeholder="Бонус (необязательно)" className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
              <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <input type="checkbox" checked={tier.active} onChange={(e) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, active: e.target.checked } : t)))} />
                активна
              </label>
              <button onClick={() => saveTier(tier)} className="rounded-md bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover">
                {savedKey === `tier-${tier.deliveries_per_cycle}` ? "Сохранено ✓" : "Сохранить"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Рабочие дни и закрытые даты магазина перенесены на отдельную страницу — раздел{" "}
        <Link href="/dashboard/shop" className="text-accent hover:underline">Магазин</Link>.
      </p>
    </div>
  );
}

function PriceInput({ label, value, saved, onSave }: { label: string; value: number; saved: boolean; onSave: (price: number) => void }) {
  const [val, setVal] = useState(String(value));
  useEffect(() => setVal(String(value)), [value]);
  return (
    <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
      {label}
      <input type="number" value={val} onChange={(e) => setVal(e.target.value)} className="w-20 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm" />
      <button onClick={() => onSave(Number(val) || 0)} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        {saved ? "✓" : "Kč"}
      </button>
    </label>
  );
}
