"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { decodeHtmlEntities } from "@/lib/format";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type ClosedDate = { closed_date: string; reason: string | null };
type Product = { name: string; rawName: string; image_url: string | null };

const WEEKDAY_LABELS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

export default function ShopPage() {
  const { profile } = useDashboard();

  const [weeklyClosed, setWeeklyClosed] = useState<Set<number>>(new Set());
  const [closedDates, setClosedDates] = useState<ClosedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClosedDate, setNewClosedDate] = useState({ date: "", reason: "" });

  const [products, setProducts] = useState<Product[]>([]);
  const [availableToday, setAvailableToday] = useState<Set<string>>(new Set());
  const [availabilitySearch, setAvailabilitySearch] = useState("");

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
        .select("product_name")
        .order("product_name", { ascending: true }),
      supabase.from("product_availability").select("product_name"),
    ]);
    setProducts(
      (productsRes.data ?? [])
        .filter((p) => p.product_name && p.product_name !== "__default__")
        .map((p) => ({ name: decodeHtmlEntities(p.product_name), rawName: p.product_name, image_url: null })),
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

  const filteredProducts = useMemo(() => {
    const q = availabilitySearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, availabilitySearch]);

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
  if (loading) return <p className="text-zinc-500">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Магазин</h1>
      <p className="text-xs text-zinc-400">
        Эти дни используются при расчёте дат доставок для подписок (нерабочие дни автоматически пропускаются).
      </p>

      <section className="space-y-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 font-medium">Регулярно закрыто</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={day}
                onClick={() => toggleWeekday(day)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  weeklyClosed.has(day) ? "bg-red-50 text-red-700" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 font-medium">Разовые закрытые дни (праздники и т.п.)</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="date"
              value={newClosedDate.date}
              onChange={(e) => setNewClosedDate((d) => ({ ...d, date: e.target.value }))}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <input
              value={newClosedDate.reason}
              onChange={(e) => setNewClosedDate((d) => ({ ...d, reason: e.target.value }))}
              placeholder="Причина"
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <button onClick={addClosedDate} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100">
              + Добавить
            </button>
          </div>
          {closedDates.length === 0 ? (
            <p className="text-sm text-zinc-400">Разовых закрытых дат пока нет.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {closedDates.map((d) => (
                <span key={d.closed_date} className="flex items-center gap-2 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  {d.closed_date}
                  {d.reason ? ` — ${d.reason}` : ""}
                  <button onClick={() => removeClosedDate(d.closed_date)} className="text-zinc-400 hover:text-red-600">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-medium">Наличие цветов сегодня</p>
            <button
              onClick={resetAvailability}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
            >
              Сбросить всё
            </button>
          </div>
          <p className="mb-3 text-xs text-zinc-400">
            Отметьте, что приехало сегодня утром — эти позиции получат плашку «Доручíme dnes» на сайте,
            остальные — «Доручíme zítra». В начале дня нажмите «Сбросить всё» и отметьте заново.
          </p>
          <input
            value={availabilitySearch}
            onChange={(e) => setAvailabilitySearch(e.target.value)}
            placeholder="Поиск по названию…"
            className="mb-3 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-zinc-400">Ничего не найдено.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredProducts.map((p) => {
                const isAvailable = availableToday.has(p.name);
                return (
                  <button
                    key={p.rawName}
                    onClick={() => toggleAvailable(p.name)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      isAvailable
                        ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200"
                        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {isAvailable ? "✓ " : ""}
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
