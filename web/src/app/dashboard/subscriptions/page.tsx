"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { generateOccurrenceDates } from "@/lib/subscriptionDates";

type Category = { id: string; key: string; name: string };
type Line = { id: string; category_id: string; name: string };
type Plan = { line_id: string; size: "small" | "medium" | "large"; price_per_delivery: number };
type Tier = { deliveries_per_cycle: number; discount_percent: number; perk_text: string | null };

type SubscriptionRow = {
  id: string;
  email: string;
  line_name_snapshot: string;
  size: string;
  deliveries_per_cycle: number;
  cycle_price_snapshot: number;
  status: string;
  cycle_anchor_date: string;
  recipient_name: string;
  stripe_subscription_id: string | null;
  created_at: string;
};

const SIZE_LABELS: Record<string, string> = { small: "S", medium: "M", large: "L" };

const emptyForm = {
  email: "",
  categoryId: "",
  lineId: "",
  size: "medium" as "small" | "medium" | "large",
  count: 4,
  startDate: "",
  recipientName: "",
  recipientPhone: "",
  address: "",
  city: "",
  psk: "",
  patro: "",
  companyName: "",
  cisloBytu: "",
  kodIntercomu: "",
  moodNote: "",
  exclusionsNote: "",
};

export default function SubscriptionsPage() {
  const { profile } = useDashboard();

  const [categories, setCategories] = useState<Category[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [closedWeekdays, setClosedWeekdays] = useState<Set<number>>(new Set());
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());

  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [occurrenceCounts, setOccurrenceCounts] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showExtra, setShowExtra] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [occurrencesById, setOccurrencesById] = useState<Record<string, { occurrence_date: string; status: string }[]>>({});

  const load = useCallback(async () => {
    const supabase = createClient();

    const [catRes, lineRes, planRes, tierRes, weeklyRes, datesRes, subRes, occRes] = await Promise.all([
      supabase.from("subscription_categories").select("id, key, name").order("sort_order"),
      supabase.from("subscription_lines").select("id, category_id, name").order("sort_order"),
      supabase.from("subscription_plans").select("line_id, size, price_per_delivery"),
      supabase.from("subscription_frequency_tiers").select("deliveries_per_cycle, discount_percent, perk_text").order("deliveries_per_cycle"),
      supabase.from("shop_weekly_closed_days").select("weekday"),
      supabase.from("shop_closed_dates").select("closed_date"),
      supabase
        .from("subscriptions")
        .select("id, email, line_name_snapshot, size, deliveries_per_cycle, cycle_price_snapshot, status, cycle_anchor_date, recipient_name, stripe_subscription_id, created_at")
        .order("created_at", { ascending: false }),
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
      setSubscriptions(subRes.data ?? []);

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

  const linesInCategory = useMemo(
    () => lines.filter((l) => l.category_id === form.categoryId),
    [lines, form.categoryId],
  );

  const selectedPlan = useMemo(
    () => plans.find((p) => p.line_id === form.lineId && p.size === form.size) ?? null,
    [plans, form.lineId, form.size],
  );

  const selectedTier = useMemo(
    () => tiers.find((t) => t.deliveries_per_cycle === form.count) ?? null,
    [tiers, form.count],
  );

  const cyclePrice = useMemo(() => {
    if (!selectedPlan || !selectedTier) return null;
    return Math.round(selectedPlan.price_per_delivery * form.count * (1 - selectedTier.discount_percent / 100));
  }, [selectedPlan, selectedTier, form.count]);

  async function toggleExpand(sub: SubscriptionRow) {
    if (expandedId === sub.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sub.id);
    if (!occurrencesById[sub.id]) {
      const supabase = createClient();
      const { data } = await supabase
        .from("subscription_occurrences")
        .select("occurrence_date, status")
        .eq("subscription_id", sub.id)
        .order("occurrence_date");
      setOccurrencesById((prev) => ({ ...prev, [sub.id]: data ?? [] }));
    }
  }

  async function handleCreate() {
    setFormError(null);

    const line = lines.find((l) => l.id === form.lineId);
    if (
      !form.email.trim() ||
      !line ||
      !selectedPlan ||
      !selectedTier ||
      !form.startDate ||
      !form.recipientName.trim() ||
      !form.recipientPhone.trim() ||
      !form.address.trim()
    ) {
      setFormError("Заполните email, линейку, размер, дату старта и данные получателя.");
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
        mood_note: form.moodNote.trim() || null,
        exclusions_note: form.exclusionsNote.trim() || null,
        recipient_name: form.recipientName.trim(),
        recipient_phone: form.recipientPhone.trim(),
        address: form.address.trim(),
        city: form.city.trim() || null,
        psk: form.psk.trim() || null,
        patro: form.patro.trim() || null,
        company_name: form.companyName.trim() || null,
        cislo_bytu: form.cisloBytu.trim() || null,
        kod_intercomu: form.kodIntercomu.trim() || null,
        cycle_anchor_date: form.startDate,
        status: "active",
        stripe_customer_id: null,
        stripe_subscription_id: null,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      setFormError(insertErr?.message ?? "Не удалось создать подписку.");
      setSaving(false);
      return;
    }

    const dates = generateOccurrenceDates(form.startDate, form.count, closedWeekdays, closedDates);
    const { error: occErr } = await supabase.from("subscription_occurrences").insert(
      dates.map((d) => ({ subscription_id: inserted.id, occurrence_date: d, status: "planned" })),
    );
    if (occErr) {
      setFormError("Подписка создана, но не удалось сгенерировать даты доставок: " + occErr.message);
    } else {
      setForm(emptyForm);
    }

    setSaving(false);
    load();
  }

  if (profile?.role !== "manager") return null;
  if (loading) return <p className="text-zinc-500">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Подписки</h1>
      <p className="text-xs text-zinc-400">
        Ручное создание — без Stripe, сразу помечается как оплаченная. Для реальных клиентских оформлений через сайт
        подписка создаётся автоматически webhook-ом после оплаты.
      </p>

      {error && <p className="text-red-600">Ошибка: {error}</p>}

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
        <p className="font-medium">Создать подписку вручную</p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Email клиента</span>
            <input
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="klient@email.cz"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Категория</span>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value, lineId: "" }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Линейка</span>
            <select
              value={form.lineId}
              onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              disabled={!form.categoryId}
            >
              <option value="">—</option>
              {linesInCategory.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Размер</span>
            <select
              value={form.size}
              onChange={(e) => setForm((f) => ({ ...f, size: e.target.value as "small" | "medium" | "large" }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="small">S</option>
              <option value="medium">M</option>
              <option value="large">L</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Доставок/месяц</span>
            <select
              value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value) }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {tiers.map((t) => (
                <option key={t.deliveries_per_cycle} value={t.deliveries_per_cycle}>
                  {t.deliveries_per_cycle} {t.discount_percent > 0 ? `(-${t.discount_percent}%)` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Дата первой доставки</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Получатель — имя</span>
            <input
              value={form.recipientName}
              onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Получатель — телефон</span>
            <input
              value={form.recipientPhone}
              onChange={(e) => setForm((f) => ({ ...f, recipientPhone: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="col-span-2 block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Адрес</span>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Město</span>
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">PSČ</span>
            <input
              value={form.psk}
              onChange={(e) => setForm((f) => ({ ...f, psk: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="text-xs font-medium text-accent"
        >
          {showExtra ? "− Скрыть доп. поля" : "+ Patro, firma, byt, intercom, nálada"}
        </button>

        {showExtra && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input
              value={form.patro}
              onChange={(e) => setForm((f) => ({ ...f, patro: e.target.value }))}
              placeholder="Patro"
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <input
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder="Firma"
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <input
              value={form.cisloBytu}
              onChange={(e) => setForm((f) => ({ ...f, cisloBytu: e.target.value }))}
              placeholder="Číslo bytu"
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <input
              value={form.kodIntercomu}
              onChange={(e) => setForm((f) => ({ ...f, kodIntercomu: e.target.value }))}
              placeholder="Kód intercomu"
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <input
              value={form.moodNote}
              onChange={(e) => setForm((f) => ({ ...f, moodNote: e.target.value }))}
              placeholder="Nálada"
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <input
              value={form.exclusionsNote}
              onChange={(e) => setForm((f) => ({ ...f, exclusionsNote: e.target.value }))}
              placeholder="Co vyloučit"
              className="col-span-2 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
          <p className="text-sm">
            Цена цикла:{" "}
            <span className="font-medium">{cyclePrice != null ? `${cyclePrice.toLocaleString("cs-CZ")} Kč` : "—"}</span>
            {selectedTier?.perk_text && <span className="ml-2 text-xs text-accent">+ {selectedTier.perk_text}</span>}
          </p>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Создаём…" : "Создать и отметить оплаченной"}
          </button>
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </div>

      <div className="space-y-3">
        <p className="font-medium">Все подписки ({subscriptions.length})</p>
        {subscriptions.length === 0 ? (
          <p className="text-zinc-500">Подписок пока нет.</p>
        ) : (
          subscriptions.map((s) => (
            <div key={s.id} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {s.email} — {s.line_name_snapshot} · {SIZE_LABELS[s.size] ?? s.size} · {s.deliveries_per_cycle}x/měsíc
                  </p>
                  <p className="text-xs text-zinc-500">
                    {s.recipient_name} · от {s.cycle_anchor_date} · {s.cycle_price_snapshot.toLocaleString("cs-CZ")} Kč ·{" "}
                    {occurrenceCounts[s.id] ?? 0} доставок сгенерировано ·{" "}
                    {s.stripe_subscription_id ? "оплачено через Stripe" : "создано вручную"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      s.status === "active" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {s.status === "active" ? "Активна" : "Отменена"}
                  </span>
                  <button
                    onClick={() => toggleExpand(s)}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                  >
                    {expandedId === s.id ? "Скрыть даты" : "Даты"}
                  </button>
                </div>
              </div>
              {expandedId === s.id && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                  {(occurrencesById[s.id] ?? []).map((o) => (
                    <span key={o.occurrence_date} className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                      {o.occurrence_date} · {o.status}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
