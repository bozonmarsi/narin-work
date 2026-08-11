"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { generateOccurrenceDates } from "@/lib/subscriptionDates";
import { generateOrderForOccurrence } from "@/lib/subscriptionOrders";
import type { Category, Line, Plan, Tier, Subscription, Occurrence, SubHistoryRow, SubscriptionSize } from "./types";
import { RECIPIENT_FIELDS } from "./types";

const FIELD_LABELS: Record<string, string> = {
  recipient_name: "Имя получателя",
  recipient_phone: "Телефон получателя",
  address: "Адрес",
  city: "Город",
  psk: "Индекс",
  patro: "Этаж",
  company_name: "Компания",
  cislo_bytu: "Квартира",
  kod_intercomu: "Код домофона",
  mood_note: "Настроение",
  exclusions_note: "Что исключить",
  cycle_anchor_date: "Дата старта цикла",
  line_id: "Линейка",
  size: "Размер",
  deliveries_per_cycle: "Доставок / цикл",
};

export function SubscriptionEditModal({
  subscription,
  categories,
  lines,
  plans,
  tiers,
  onClose,
  onSaved,
}: {
  subscription: Subscription;
  categories: Category[];
  lines: Line[];
  plans: Plan[];
  tiers: Tier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    line_id: subscription.line_id ?? "",
    size: subscription.size,
    deliveries_per_cycle: subscription.deliveries_per_cycle,
    cycle_anchor_date: subscription.cycle_anchor_date,
    recipient_name: subscription.recipient_name,
    recipient_phone: subscription.recipient_phone,
    address: subscription.address,
    city: subscription.city ?? "",
    psk: subscription.psk ?? "",
    patro: subscription.patro ?? "",
    company_name: subscription.company_name ?? "",
    cislo_bytu: subscription.cislo_bytu ?? "",
    kod_intercomu: subscription.kod_intercomu ?? "",
    mood_note: subscription.mood_note ?? "",
    exclusions_note: subscription.exclusions_note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [history, setHistory] = useState<SubHistoryRow[]>([]);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [occRes, histRes] = await Promise.all([
        supabase.from("subscription_occurrences").select("*").eq("subscription_id", subscription.id).order("occurrence_date"),
        supabase
          .from("subscription_history")
          .select("id, note, changed_at, changed_by_user:users!changed_by(full_name)")
          .eq("subscription_id", subscription.id)
          .order("changed_at", { ascending: true }),
      ]);
      setOccurrences((occRes.data as Occurrence[]) ?? []);
      setHistory((histRes.data as unknown as SubHistoryRow[]) ?? []);
      setLoadingSub(false);
    })();
  }, [subscription.id]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const line = lines.find((l) => l.id === form.line_id);
  const linesInCategory = (categoryId: string) => lines.filter((l) => l.category_id === categoryId);
  const currentCategoryId = line?.category_id ?? categories.find((c) => linesInCategory(c.id).some((l) => l.id === form.line_id))?.id ?? "";
  const plan = plans.find((p) => p.line_id === form.line_id && p.size === form.size);
  const tier = tiers.find((t) => t.deliveries_per_cycle === form.deliveries_per_cycle);
  const cyclePrice = plan && tier ? Math.round(plan.price_per_delivery * form.deliveries_per_cycle * (1 - tier.discount_percent / 100)) : null;

  async function handleSave() {
    setError(null);
    const {
      data: { user },
    } = await createClient().auth.getUser();
    if (!user) {
      setError("Не авторизован");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const changedFields: string[] = [];
    const payload: Record<string, unknown> = {};

    if (form.line_id !== (subscription.line_id ?? "")) {
      changedFields.push(FIELD_LABELS.line_id);
      payload.line_id = form.line_id || null;
      payload.line_name_snapshot = line?.name ?? subscription.line_name_snapshot;
    }
    if (form.size !== subscription.size) {
      changedFields.push(FIELD_LABELS.size);
      payload.size = form.size;
    }
    if (form.deliveries_per_cycle !== subscription.deliveries_per_cycle) {
      changedFields.push(FIELD_LABELS.deliveries_per_cycle);
      payload.deliveries_per_cycle = form.deliveries_per_cycle;
    }
    if (plan && payload.line_id !== undefined || plan && payload.size !== undefined) {
      payload.price_per_delivery_snapshot = plan!.price_per_delivery;
    }
    if (tier && payload.deliveries_per_cycle !== undefined) {
      payload.discount_percent_snapshot = tier.discount_percent;
    }
    if (("price_per_delivery_snapshot" in payload || "discount_percent_snapshot" in payload) && cyclePrice != null) {
      payload.cycle_price_snapshot = cyclePrice;
    }
    if (form.cycle_anchor_date !== subscription.cycle_anchor_date) {
      changedFields.push(FIELD_LABELS.cycle_anchor_date);
      payload.cycle_anchor_date = form.cycle_anchor_date;
    }
    for (const f of RECIPIENT_FIELDS) {
      const current = (subscription[f as keyof Subscription] ?? "") as string;
      const next = form[f as keyof typeof form] as string;
      if (next !== current) {
        changedFields.push(FIELD_LABELS[f] ?? f);
        payload[f] = next || null;
      }
    }
    if (form.mood_note !== (subscription.mood_note ?? "")) {
      changedFields.push(FIELD_LABELS.mood_note);
      payload.mood_note = form.mood_note || null;
    }
    if (form.exclusions_note !== (subscription.exclusions_note ?? "")) {
      changedFields.push(FIELD_LABELS.exclusions_note);
      payload.exclusions_note = form.exclusions_note || null;
    }

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    const { error: updateErr } = await supabase.from("subscriptions").update(payload).eq("id", subscription.id);
    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    await supabase.from("subscription_history").insert({
      subscription_id: subscription.id,
      changed_by: user.id,
      note: `Изменены поля: ${changedFields.join(", ")}`,
    });

    setSaving(false);
    onSaved();
  }

  async function handleCancel() {
    setCancelling(true);
    const {
      data: { user },
    } = await createClient().auth.getUser();
    const supabase = createClient();
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", subscription.id);
    await supabase.from("subscription_history").insert({
      subscription_id: subscription.id,
      changed_by: user?.id,
      note: "Подписка отменена менеджером",
    });
    setCancelling(false);
    onSaved();
  }

  async function handleGenerateNextCycle() {
    const supabase = createClient();
    const [weeklyRes, datesRes] = await Promise.all([
      supabase.from("shop_weekly_closed_days").select("weekday"),
      supabase.from("shop_closed_dates").select("closed_date"),
    ]);
    const closedWeekdays = new Set((weeklyRes.data ?? []).map((r) => r.weekday));
    const closedDates = new Set((datesRes.data ?? []).map((r) => r.closed_date));

    const lastDate = occurrences.length > 0 ? occurrences[occurrences.length - 1].occurrence_date : subscription.cycle_anchor_date;
    const nextAnchor = new Date(lastDate + "T00:00:00Z");
    nextAnchor.setUTCDate(nextAnchor.getUTCDate() + 1);
    const nextAnchorStr = nextAnchor.toISOString().slice(0, 10);

    const dates = generateOccurrenceDates(nextAnchorStr, subscription.deliveries_per_cycle, closedWeekdays, closedDates);
    const { data: inserted, error: insErr } = await supabase
      .from("subscription_occurrences")
      .insert(dates.map((d) => ({ subscription_id: subscription.id, occurrence_date: d, status: "planned" })))
      .select("*");
    if (!insErr && inserted) {
      // Generate the real orders for the whole new cycle right away — not
      // just the next few days — so purchasing sees total demand up front.
      for (const occ of inserted as Occurrence[]) {
        const orderId = await generateOrderForOccurrence(supabase, subscription, occ);
        if (orderId) {
          occ.order_id = orderId;
          occ.status = "generated";
        }
      }

      setOccurrences((prev) => [...prev, ...(inserted as Occurrence[])].sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date)));
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("subscription_history").insert({
        subscription_id: subscription.id,
        changed_by: user?.id,
        note: `Сгенерирован следующий цикл (${dates.length} доставок с ${dates[0]})`,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <p className="text-lg font-semibold">{subscription.email}</p>
            <p className="text-sm text-zinc-500">
              создана {formatDateTime(subscription.created_at)} ·{" "}
              {subscription.stripe_subscription_id ? "Stripe" : "создана вручную"}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500">Статус</h3>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  subscription.status === "active" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {subscription.status === "active" ? "Активна" : "Отменена"}
              </span>
            </div>
            {subscription.status === "active" &&
              (cancelConfirm ? (
                <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2">
                  <span className="text-sm text-red-700">Точно отменить эту подписку?</span>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelling ? "Отменяем…" : "Подтвердить отмену"}
                  </button>
                  <button onClick={() => setCancelConfirm(false)} className="text-sm text-zinc-500 hover:text-zinc-700">
                    Назад
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCancelConfirm(true)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Отменить подписку
                </button>
              ))}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">План</h3>
            <p className="text-xs text-amber-600">
              Изменение здесь не влияет на списания в активной Stripe-подписке — только на нашу запись. Чтобы изменить
              реальную оплату, нужно менять её напрямую в Stripe.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Категория">
                <select
                  value={currentCategoryId}
                  onChange={(e) => set("line_id", linesInCategory(e.target.value)[0]?.id ?? "")}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Линейка">
                <select
                  value={form.line_id}
                  onChange={(e) => set("line_id", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  {linesInCategory(currentCategoryId).map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Размер">
                <select
                  value={form.size}
                  onChange={(e) => set("size", e.target.value as SubscriptionSize)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="small">S</option>
                  <option value="medium">M</option>
                  <option value="large">L</option>
                </select>
              </Field>
              <Field label="Доставок / цикл">
                <select
                  value={form.deliveries_per_cycle}
                  onChange={(e) => set("deliveries_per_cycle", Number(e.target.value))}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  {tiers.map((t) => (
                    <option key={t.deliveries_per_cycle} value={t.deliveries_per_cycle}>
                      {t.deliveries_per_cycle} {t.discount_percent > 0 ? `(-${t.discount_percent}%)` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Дата старта цикла">
                <input
                  type="date"
                  value={form.cycle_anchor_date}
                  onChange={(e) => set("cycle_anchor_date", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Цена цикла (по выбору выше)">
                <p className="px-2 py-1.5 text-sm font-medium">{cyclePrice != null ? `${cyclePrice.toLocaleString("cs-CZ")} Kč` : "—"}</p>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Получатель по умолчанию</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Имя"><input value={form.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Телефон"><input value={form.recipient_phone} onChange={(e) => set("recipient_phone", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Адрес"><input value={form.address} onChange={(e) => set("address", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Город"><input value={form.city} onChange={(e) => set("city", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Индекс"><input value={form.psk} onChange={(e) => set("psk", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Этаж"><input value={form.patro} onChange={(e) => set("patro", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Компания"><input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Квартира"><input value={form.cislo_bytu} onChange={(e) => set("cislo_bytu", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Код домофона"><input value={form.kod_intercomu} onChange={(e) => set("kod_intercomu", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Настроение и заметки</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Настроение"><input value={form.mood_note} onChange={(e) => set("mood_note", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Что исключить"><input value={form.exclusions_note} onChange={(e) => set("exclusions_note", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500">Даты цикла ({occurrences.length})</h3>
              <button
                onClick={handleGenerateNextCycle}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                + Сгенерировать следующий цикл
              </button>
            </div>
            {loadingSub ? (
              <p className="text-sm text-zinc-400">Загрузка…</p>
            ) : (
              <div className="space-y-2">
                {occurrences.map((occ) => (
                  <OccurrenceRow key={occ.id} occurrence={occ} subscription={subscription} onChange={(updated) => {
                    setOccurrences((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
                  }} />
                ))}
              </div>
            )}
          </section>

          {history.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-500">История</h3>
              <div className="space-y-1 text-xs text-zinc-500">
                {history.map((h) => (
                  <p key={h.id}>
                    {formatDateTime(h.changed_at)} — {h.note} · {h.changed_by_user?.full_name ?? "система"}
                  </p>
                ))}
              </div>
            </section>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50">
            Закрыть
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

const OCC_STATUS_LABEL: Record<string, string> = { planned: "Запланировано", generated: "Заказ создан", skipped: "Пропущено" };
const OCC_STATUS_COLOR: Record<string, string> = {
  planned: "bg-zinc-100 text-zinc-600",
  generated: "bg-green-50 text-green-700",
  skipped: "bg-orange-50 text-orange-700",
};

function OccurrenceRow({
  occurrence,
  subscription,
  onChange,
}: {
  occurrence: Occurrence;
  subscription: Subscription;
  onChange: (updated: Occurrence) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dateValue, setDateValue] = useState(occurrence.occurrence_date);
  const [override, setOverride] = useState({
    recipient_name: occurrence.recipient_name ?? "",
    recipient_phone: occurrence.recipient_phone ?? "",
    address: occurrence.address ?? "",
    city: occurrence.city ?? "",
    psk: occurrence.psk ?? "",
  });
  const [pending, setPending] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const hasOverride = !!(occurrence.recipient_name || occurrence.address);

  async function saveDate() {
    if (dateValue === occurrence.occurrence_date) return;
    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("subscription_occurrences")
      .update({ occurrence_date: dateValue })
      .eq("id", occurrence.id)
      .select("*")
      .single();

    // Keep the already-generated order (visible to warehouse/courier) in
    // sync — route_sequence is nulled the same way OrderEditModal does for
    // any date/address change, so the courier app knows to recompute it.
    if (!error && occurrence.order_id) {
      await supabase
        .from("tilda_orders")
        .update({ delivery_date: dateValue, route_sequence: null })
        .eq("id", occurrence.order_id);
    }

    setPending(false);
    if (!error && data) onChange(data as Occurrence);
  }

  async function saveOverride() {
    setPending(true);
    const supabase = createClient();
    const payload = {
      recipient_name: override.recipient_name || null,
      recipient_phone: override.recipient_phone || null,
      address: override.address || null,
      city: override.city || null,
      psk: override.psk || null,
    };
    const { data, error } = await supabase
      .from("subscription_occurrences")
      .update(payload)
      .eq("id", occurrence.id)
      .select("*")
      .single();

    if (!error && occurrence.order_id) {
      await supabase
        .from("tilda_orders")
        .update({
          recipient_name: payload.recipient_name ?? subscription.recipient_name,
          recipient_phone: payload.recipient_phone ?? subscription.recipient_phone,
          address: payload.address ?? subscription.address,
          city: payload.city ?? subscription.city,
          psk: payload.psk ?? subscription.psk,
          route_sequence: null,
        })
        .eq("id", occurrence.order_id);
    }

    setPending(false);
    if (!error && data) onChange(data as Occurrence);
  }

  async function clearOverride() {
    setOverride({ recipient_name: "", recipient_phone: "", address: "", city: "", psk: "" });
    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("subscription_occurrences")
      .update({ recipient_name: null, recipient_phone: null, address: null, city: null, psk: null })
      .eq("id", occurrence.id)
      .select("*")
      .single();
    setPending(false);
    if (!error && data) onChange(data as Occurrence);
  }

  async function skip() {
    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("subscription_occurrences")
      .update({ status: "skipped" })
      .eq("id", occurrence.id)
      .select("*")
      .single();
    setPending(false);
    if (!error && data) onChange(data as Occurrence);
  }

  async function generateOrder() {
    setPending(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const orderId = await generateOrderForOccurrence(supabase, subscription, occurrence);
    if (!orderId) {
      setPending(false);
      setConfirmGenerate(false);
      return;
    }

    const { data: updatedOcc, error: occErr } = await supabase
      .from("subscription_occurrences")
      .select("*")
      .eq("id", occurrence.id)
      .single();

    await supabase.from("subscription_history").insert({
      subscription_id: subscription.id,
      changed_by: user?.id,
      note: `Создан заказ для доставки ${occurrence.occurrence_date}`,
    });

    setPending(false);
    setConfirmGenerate(false);
    if (!occErr && updatedOcc) onChange(updatedOcc as Occurrence);
  }

  async function uploadPreview(file: File) {
    setUploadError(null);
    setPending(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${subscription.id}/${occurrence.id}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("subscription-previews").upload(path, file, { upsert: true });
    if (uploadErr) {
      setUploadError(uploadErr.message);
      setPending(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("subscription-previews").getPublicUrl(path);
    const { data, error } = await supabase
      .from("subscription_occurrences")
      .update({ preview_photo_url: `${urlData.publicUrl}?t=${Date.now()}`, preview_uploaded_at: new Date().toISOString() })
      .eq("id", occurrence.id)
      .select("*")
      .single();
    setPending(false);
    if (!error && data) onChange(data as Occurrence);
  }

  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {occurrence.preview_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={occurrence.preview_photo_url} alt="" className="h-10 w-10 rounded-md object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-md bg-zinc-100" />
          )}
          <div>
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              onBlur={saveDate}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
            {hasOverride && <span className="ml-2 text-xs text-accent">получатель изменён</span>}
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${OCC_STATUS_COLOR[occurrence.status]}`}>
            {OCC_STATUS_LABEL[occurrence.status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100">
            Загрузить превью
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPreview(e.target.files[0])}
            />
          </label>
          <button onClick={() => setExpanded((v) => !v)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100">
            {expanded ? "Скрыть" : "Получатель"}
          </button>
          {occurrence.status === "planned" && (
            <button onClick={skip} disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
              Пропустить
            </button>
          )}
          {!occurrence.order_id &&
            occurrence.status !== "skipped" &&
            (confirmGenerate ? (
              <>
                <button onClick={generateOrder} disabled={pending} className="rounded-md bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50">
                  Подтвердить
                </button>
                <button onClick={() => setConfirmGenerate(false)} className="text-xs text-zinc-500">Назад</button>
              </>
            ) : (
              <button onClick={() => setConfirmGenerate(true)} className="rounded-md bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover">
                Создать заказ
              </button>
            ))}
        </div>
      </div>

      {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
          <p className="text-xs text-zinc-400">Пустое поле = будет использован получатель по умолчанию из подписки.</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <input placeholder="Имя" value={override.recipient_name} onChange={(e) => setOverride((o) => ({ ...o, recipient_name: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input placeholder="Телефон" value={override.recipient_phone} onChange={(e) => setOverride((o) => ({ ...o, recipient_phone: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input placeholder="Адрес" value={override.address} onChange={(e) => setOverride((o) => ({ ...o, address: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input placeholder="Город" value={override.city} onChange={(e) => setOverride((o) => ({ ...o, city: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input placeholder="Индекс" value={override.psk} onChange={(e) => setOverride((o) => ({ ...o, psk: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={saveOverride} disabled={pending} className="rounded-md bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50">
              Сохранить получателя
            </button>
            {hasOverride && (
              <button onClick={clearOverride} disabled={pending} className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
                Убрать переопределение
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
