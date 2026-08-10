"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { generateOccurrenceDates } from "@/lib/subscriptionDates";
import { SubscriptionEditModal } from "./SubscriptionEditModal";
import type { Category, Line, Plan, Tier, Subscription, SubscriptionSize } from "./types";
import { SIZE_LABELS } from "./types";

const emptyForm = {
  email: "",
  categoryId: "",
  lineId: "",
  size: "medium" as SubscriptionSize,
  count: 4,
  startDate: "",
  recipientName: "",
  recipientPhone: "",
  address: "",
  city: "",
  psk: "",
};

export default function SubscriptionsPage() {
  const { profile } = useDashboard();

  const [categories, setCategories] = useState<Category[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [closedWeekdays, setClosedWeekdays] = useState<Set<number>>(new Set());
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [occurrenceCounts, setOccurrenceCounts] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"active" | "cancelled" | "all">("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Subscription | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();

    const [catRes, lineRes, planRes, tierRes, weeklyRes, datesRes, subRes, occRes] = await Promise.all([
      supabase.from("subscription_categories").select("*").order("sort_order"),
      supabase.from("subscription_lines").select("*").order("sort_order"),
      supabase.from("subscription_plans").select("*"),
      supabase.from("subscription_frequency_tiers").select("*").order("deliveries_per_cycle"),
      supabase.from("shop_weekly_closed_days").select("weekday"),
      supabase.from("shop_closed_dates").select("closed_date"),
      supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("subscription_occurrences").select("subscription_id"),
    ]);

    const firstError = [catRes, lineRes, planRes, tierRes, weeklyRes, datesRes, subRes, occRes].find((r) => r.error)?.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setError(null);
      setCategories(catRes.data ?? []);
      setLines(lineRes.data ?? []);
      setPlans(planRes.data ?? []);
      setTiers(tierRes.data ?? []);
      setClosedWeekdays(new Set((weeklyRes.data ?? []).map((r) => r.weekday)));
      setClosedDates(new Set((datesRes.data ?? []).map((r) => r.closed_date)));
      setSubscriptions((subRes.data as Subscription[]) ?? []);

      const counts: Record<string, number> = {};
      for (const o of occRes.data ?? []) {
        counts[o.subscription_id] = (counts[o.subscription_id] ?? 0) + 1;
      }
      setOccurrenceCounts(counts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const linesInCategory = useMemo(() => lines.filter((l) => l.category_id === form.categoryId), [lines, form.categoryId]);
  const selectedPlan = useMemo(() => plans.find((p) => p.line_id === form.lineId && p.size === form.size) ?? null, [plans, form.lineId, form.size]);
  const selectedTier = useMemo(() => tiers.find((t) => t.deliveries_per_cycle === form.count) ?? null, [tiers, form.count]);
  const cyclePrice = useMemo(() => {
    if (!selectedPlan || !selectedTier) return null;
    return Math.round(selectedPlan.price_per_delivery * form.count * (1 - selectedTier.discount_percent / 100));
  }, [selectedPlan, selectedTier, form.count]);

  const filtered = useMemo(() => {
    return subscriptions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!s.email.toLowerCase().includes(q) && !s.recipient_name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [subscriptions, statusFilter, search]);

  async function handleCreate() {
    setFormError(null);
    const line = lines.find((l) => l.id === form.lineId);
    if (!form.email.trim() || !line || !selectedPlan || !selectedTier || !form.startDate || !form.recipientName.trim() || !form.recipientPhone.trim() || !form.address.trim()) {
      setFormError("Заполните email, линейку, размер, дату старта и получателя.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { data: inserted, error: insertErr } = await supabase
      .from("subscriptions")
      .insert({
        email: form.email.trim().toLowerCase(),
        line_id: line.id,
        line_name_snapshot: line.name,
        size: form.size,
        price_per_delivery_snapshot: selectedPlan.price_per_delivery,
        deliveries_per_cycle: form.count,
        discount_percent_snapshot: selectedTier.discount_percent,
        cycle_price_snapshot: cyclePrice,
        recipient_name: form.recipientName.trim(),
        recipient_phone: form.recipientPhone.trim(),
        address: form.address.trim(),
        city: form.city.trim() || null,
        psk: form.psk.trim() || null,
        cycle_anchor_date: form.startDate,
        status: "active",
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      setFormError(insertErr?.message ?? "Не удалось создать подписку.");
      setSaving(false);
      return;
    }

    const dates = generateOccurrenceDates(form.startDate, form.count, closedWeekdays, closedDates);
    const { error: occErr } = await supabase
      .from("subscription_occurrences")
      .insert(dates.map((d) => ({ subscription_id: inserted.id, occurrence_date: d, status: "planned" })));
    if (occErr) {
      setFormError("Подписка создана, но не удалось сгенерировать даты: " + occErr.message);
    } else {
      setForm(emptyForm);
      setShowCreate(false);
    }
    setSaving(false);
    load();
  }

  if (profile?.role !== "manager") return null;
  if (loading) return <p className="text-zinc-500">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Подписки</h1>
        <Link href="/dashboard/subscriptions/catalog" className="text-sm text-accent hover:underline">
          Каталог и цены →
        </Link>
      </div>

      {error && <p className="text-red-600">Ошибка: {error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["active", "cancelled", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                statusFilter === s ? "bg-accent text-white" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {s === "active" ? "Активные" : s === "cancelled" ? "Отменённые" : "Все"}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по email или получателю…"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {showCreate ? "− Закрыть форму" : "+ Новая подписка"}
        </button>
      </div>

      {showCreate && (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-400">Ручное создание — без Stripe, сразу считается оплаченной.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Email клиента</span>
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Категория</span>
              <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value, lineId: "" }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                <option value="">—</option>
                {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Линейка</span>
              <select value={form.lineId} onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" disabled={!form.categoryId}>
                <option value="">—</option>
                {linesInCategory.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Размер</span>
              <select value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value as SubscriptionSize }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                <option value="small">S</option>
                <option value="medium">M</option>
                <option value="large">L</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Доставок/месяц</span>
              <select value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value) }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                {tiers.map((t) => (<option key={t.deliveries_per_cycle} value={t.deliveries_per_cycle}>{t.deliveries_per_cycle} {t.discount_percent > 0 ? `(-${t.discount_percent}%)` : ""}</option>))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Дата первой доставки</span>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Получатель — имя</span>
              <input value={form.recipientName} onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Получатель — телефон</span>
              <input value={form.recipientPhone} onChange={(e) => setForm((f) => ({ ...f, recipientPhone: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="col-span-2 block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Адрес</span>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Город</span>
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-zinc-500">Индекс</span>
              <input value={form.psk} onChange={(e) => setForm((f) => ({ ...f, psk: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
            <p className="text-sm">
              Цена цикла: <span className="font-medium">{cyclePrice != null ? `${cyclePrice.toLocaleString("cs-CZ")} Kč` : "—"}</span>
            </p>
            <button onClick={handleCreate} disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {saving ? "Создаём…" : "Создать и отметить оплаченной"}
            </button>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm text-zinc-500">{filtered.length} подписок</p>
        {filtered.length === 0 ? (
          <p className="text-zinc-500">Ничего не найдено.</p>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="block w-full rounded-lg border border-zinc-200 bg-white p-4 text-left hover:border-accent"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {s.email} — {s.line_name_snapshot} · {SIZE_LABELS[s.size]} · {s.deliveries_per_cycle}x/месяц
                  </p>
                  <p className="text-xs text-zinc-500">
                    {s.recipient_name} · с {s.cycle_anchor_date} · {s.cycle_price_snapshot.toLocaleString("cs-CZ")} Kč ·{" "}
                    {occurrenceCounts[s.id] ?? 0} доставок · {s.stripe_subscription_id ? "Stripe" : "вручную"}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${s.status === "active" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
                  {s.status === "active" ? "Активна" : "Отменена"}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {selected && (
        <SubscriptionEditModal
          subscription={selected}
          categories={categories}
          lines={lines}
          plans={plans}
          tiers={tiers}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}
