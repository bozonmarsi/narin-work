"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { generateOccurrenceDates } from "@/lib/subscriptionDates";
import type { Category, Line, Plan, Tier, Subscription, Occurrence, SubHistoryRow, SubscriptionSize } from "./types";
import { SIZE_LABELS, RECIPIENT_FIELDS } from "./types";

const FIELD_LABELS: Record<string, string> = {
  recipient_name: "Jméno příjemce",
  recipient_phone: "Telefon příjemce",
  address: "Adresa",
  city: "Město",
  psk: "PSČ",
  patro: "Patro",
  company_name: "Firma",
  cislo_bytu: "Číslo bytu",
  kod_intercomu: "Kód intercomu",
  mood_note: "Nálada",
  exclusions_note: "Co vyloučit",
  cycle_anchor_date: "Datum startu cyklu",
  line_id: "Linie",
  size: "Velikost",
  deliveries_per_cycle: "Doručení / cyklus",
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
      note: "Předplatné zrušeno manažerem",
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
      setOccurrences((prev) => [...prev, ...(inserted as Occurrence[])].sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date)));
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("subscription_history").insert({
        subscription_id: subscription.id,
        changed_by: user?.id,
        note: `Vygenerován další cyklus (${dates.length} termínů od ${dates[0]})`,
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
              vytvořeno {formatDateTime(subscription.created_at)} ·{" "}
              {subscription.stripe_subscription_id ? "Stripe" : "vytvořeno manuálně"}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600" aria-label="Zavřít">
            ✕
          </button>
        </div>

        <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500">Stav</h3>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  subscription.status === "active" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {subscription.status === "active" ? "Aktivní" : "Zrušeno"}
              </span>
            </div>
            {subscription.status === "active" &&
              (cancelConfirm ? (
                <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2">
                  <span className="text-sm text-red-700">Opravdu zrušit toto předplatné?</span>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelling ? "Rušíme…" : "Potvrdit zrušení"}
                  </button>
                  <button onClick={() => setCancelConfirm(false)} className="text-sm text-zinc-500 hover:text-zinc-700">
                    Zpět
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCancelConfirm(true)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Zrušit předplatné
                </button>
              ))}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Plán</h3>
            <p className="text-xs text-amber-600">
              Úprava zde nemění účtování v aktivním Stripe předplatném — jen naši evidenci. Na skutečnou platbu je potřeba
              zásah přímo ve Stripe.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kategorie">
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
              <Field label="Linie">
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
              <Field label="Velikost">
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
              <Field label="Doručení / cyklus">
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
              <Field label="Datum startu cyklu">
                <input
                  type="date"
                  value={form.cycle_anchor_date}
                  onChange={(e) => set("cycle_anchor_date", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Cena cyklu (dle výběru výše)">
                <p className="px-2 py-1.5 text-sm font-medium">{cyclePrice != null ? `${cyclePrice.toLocaleString("cs-CZ")} Kč` : "—"}</p>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Výchozí příjemce</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jméno"><input value={form.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Telefon"><input value={form.recipient_phone} onChange={(e) => set("recipient_phone", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Adresa"><input value={form.address} onChange={(e) => set("address", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Město"><input value={form.city} onChange={(e) => set("city", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="PSČ"><input value={form.psk} onChange={(e) => set("psk", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Patro"><input value={form.patro} onChange={(e) => set("patro", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Firma"><input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Číslo bytu"><input value={form.cislo_bytu} onChange={(e) => set("cislo_bytu", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Kód intercomu"><input value={form.kod_intercomu} onChange={(e) => set("kod_intercomu", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500">Nálada a poznámky</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nálada"><input value={form.mood_note} onChange={(e) => set("mood_note", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
              <Field label="Co vyloučit"><input value={form.exclusions_note} onChange={(e) => set("exclusions_note", e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></Field>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500">Termíny cyklu ({occurrences.length})</h3>
              <button
                onClick={handleGenerateNextCycle}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                + Vygenerovat další cyklus
              </button>
            </div>
            {loadingSub ? (
              <p className="text-sm text-zinc-400">Načítání…</p>
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
              <h3 className="text-sm font-semibold text-zinc-500">Historie</h3>
              <div className="space-y-1 text-xs text-zinc-500">
                {history.map((h) => (
                  <p key={h.id}>
                    {formatDateTime(h.changed_at)} — {h.note} · {h.changed_by_user?.full_name ?? "systém"}
                  </p>
                ))}
              </div>
            </section>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50">
            Zavřít
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Ukládáme…" : "Uložit"}
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

const OCC_STATUS_LABEL: Record<string, string> = { planned: "Naplánováno", generated: "Objednávka vytvořena", skipped: "Přeskočeno" };
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

    const { data: newOrder, error: orderErr } = await supabase
      .from("tilda_orders")
      .insert({
        order_id: `PREDPL-${subscription.id.slice(0, 8)}-${occurrence.occurrence_date}`,
        customer_email: subscription.email,
        recipient_name: occurrence.recipient_name ?? subscription.recipient_name,
        recipient_phone: occurrence.recipient_phone ?? subscription.recipient_phone,
        address: occurrence.address ?? subscription.address,
        city: occurrence.city ?? subscription.city,
        psk: occurrence.psk ?? subscription.psk,
        patro: occurrence.patro ?? subscription.patro,
        company_name: occurrence.company_name ?? subscription.company_name,
        cislo_bytu: occurrence.cislo_bytu ?? subscription.cislo_bytu,
        kod_intercomu: occurrence.kod_intercomu ?? subscription.kod_intercomu,
        delivery_date: occurrence.occurrence_date,
        delivery_type: "Doručení kurýrem (předplatné)",
        products_text: `${subscription.line_name_snapshot} · ${SIZE_LABELS[subscription.size]} (předplatné)`,
        manager_comment: "Vygenerováno z předplatného, již uhrazeno v rámci cyklu.",
        subscription_id: subscription.id,
        status: "new",
      })
      .select("id")
      .single();

    if (orderErr || !newOrder) {
      setPending(false);
      setConfirmGenerate(false);
      return;
    }

    const { data: updatedOcc, error: occErr } = await supabase
      .from("subscription_occurrences")
      .update({ order_id: newOrder.id, status: "generated" })
      .eq("id", occurrence.id)
      .select("*")
      .single();

    await supabase.from("subscription_history").insert({
      subscription_id: subscription.id,
      changed_by: user?.id,
      note: `Vytvořena objednávka pro termín ${occurrence.occurrence_date}`,
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
            {hasOverride && <span className="ml-2 text-xs text-accent">upraven příjemce</span>}
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${OCC_STATUS_COLOR[occurrence.status]}`}>
            {OCC_STATUS_LABEL[occurrence.status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100">
            Nahrát náhled
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPreview(e.target.files[0])}
            />
          </label>
          <button onClick={() => setExpanded((v) => !v)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100">
            {expanded ? "Skrýt" : "Příjemce"}
          </button>
          {occurrence.status === "planned" && (
            <button onClick={skip} disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
              Přeskočit
            </button>
          )}
          {!occurrence.order_id &&
            occurrence.status !== "skipped" &&
            (confirmGenerate ? (
              <>
                <button onClick={generateOrder} disabled={pending} className="rounded-md bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50">
                  Potvrdit
                </button>
                <button onClick={() => setConfirmGenerate(false)} className="text-xs text-zinc-500">Zpět</button>
              </>
            ) : (
              <button onClick={() => setConfirmGenerate(true)} className="rounded-md bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover">
                Vytvořit objednávku
              </button>
            ))}
        </div>
      </div>

      {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
          <p className="text-xs text-zinc-400">Prázdné pole = použije se výchozí příjemce z předplatného.</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <input placeholder="Jméno" value={override.recipient_name} onChange={(e) => setOverride((o) => ({ ...o, recipient_name: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input placeholder="Telefon" value={override.recipient_phone} onChange={(e) => setOverride((o) => ({ ...o, recipient_phone: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input placeholder="Adresa" value={override.address} onChange={(e) => setOverride((o) => ({ ...o, address: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input placeholder="Město" value={override.city} onChange={(e) => setOverride((o) => ({ ...o, city: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input placeholder="PSČ" value={override.psk} onChange={(e) => setOverride((o) => ({ ...o, psk: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={saveOverride} disabled={pending} className="rounded-md bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50">
              Uložit příjemce
            </button>
            {hasOverride && (
              <button onClick={clearOverride} disabled={pending} className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
                Zrušit úpravu
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
