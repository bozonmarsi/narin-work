"use client";

import { useState } from "react";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { formatDate, formatDateTime } from "@/lib/format";

type CustomerRow = {
  email: string;
  balance: number;
  ma_id: string | null;
  birthday: string | null;
  name: string | null;
  phone: string | null;
  ordersCount: number;
  lastOrderAt: string | null;
  lifetimeEarned: number;
  depositBalance: number;
  sawCabinetTour: boolean;
  avgRating: number | null;
  reviewCount: number;
};

type ReviewRowLite = {
  id: string;
  order_id: string;
  customer_email: string;
  rating: number;
  comment: string | null;
  created_at: string | null;
};

type OrderRowLite = {
  order_id: string | null;
  created_at: string | null;
  order_total: number | null;
  status: string | null;
  products_text: string | null;
};

type PointsRowLite = {
  id: string;
  amount: number;
  type: string | null;
  order_id: string | null;
  description: string | null;
  created_at: string | null;
};

type DateRowLite = {
  id: string;
  label: string;
  event_date: string;
  recurrence: string | null;
};

type SubscriptionRowLite = {
  status: string | null;
  line_name_snapshot: string | null;
  created_at: string | null;
};

const RECURRENCE_OPTIONS = [
  ["once", "Один раз"],
  ["monthly", "Ежемесячно"],
  ["yearly", "Ежегодно"],
] as const;

export default function UsersPage() {
  const { profile, user } = useDashboard();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"balance" | "orders" | "recent">("recent");
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [recentReviews, setRecentReviews] = useState<ReviewRowLite[]>([]);

  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [orders, setOrders] = useState<OrderRowLite[]>([]);
  const [pointsHistory, setPointsHistory] = useState<PointsRowLite[]>([]);
  const [dates, setDates] = useState<DateRowLite[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRowLite | null>(null);

  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsDescription, setPointsDescription] = useState("");
  const [pointsSubmitting, setPointsSubmitting] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  const [dateLabel, setDateLabel] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [dateRecurrence, setDateRecurrence] = useState<"once" | "monthly" | "yearly">("yearly");
  const [dateSubmitting, setDateSubmitting] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const [birthdayValue, setBirthdayValue] = useState("");
  const [birthdaySubmitting, setBirthdaySubmitting] = useState(false);

  // Один общий проход при заходе на страницу — собираем клиентов из
  // нескольких таблиц (единого "customers" в базе нет, это набор данных,
  // связанных по email) и склеиваем в один список в памяти, а не по
  // отдельному запросу на каждую строку.
  useEffect(() => {
    if (profile?.role !== "manager") return;
    let active = true;
    setLoading(true);
    const supabase = createClient();

    (async () => {
      const [pointsRes, ordersRes, earnedRes, depositsRes, tourRes, reviewsRes] = await Promise.all([
        supabase.from("Tilda points").select("email, balance, ma_id, birthday").limit(5000),
        supabase
          .from("tilda_orders")
          .select("customer_email, customer_name, customer_last_name, customer_phone, order_total, created_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase.from("points_transactions").select("user_email, amount").gt("amount", 0),
        supabase.from("customer_deposits").select("email, balance"),
        supabase.from("ui_tours_seen").select("user_email").eq("tour_key", "lk_cabinet_v1"),
        supabase
          .from("order_reviews")
          .select("id, order_id, customer_email, rating, comment, created_at")
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

      if (!active) return;

      const orderStats = new Map<
        string,
        { count: number; lastAt: string | null; name: string | null; phone: string | null }
      >();
      for (const o of ordersRes.data ?? []) {
        const key = (o.customer_email ?? "").trim().toLowerCase();
        if (!key) continue;
        const existing = orderStats.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          const name = [o.customer_name, o.customer_last_name].filter(Boolean).join(" ") || null;
          orderStats.set(key, { count: 1, lastAt: o.created_at, name, phone: o.customer_phone ?? null });
        }
      }

      const earnedByEmail = new Map<string, number>();
      for (const r of earnedRes.data ?? []) {
        const key = (r.user_email ?? "").trim().toLowerCase();
        if (!key) continue;
        earnedByEmail.set(key, (earnedByEmail.get(key) ?? 0) + r.amount);
      }

      const depositByEmail = new Map<string, number>();
      for (const r of depositsRes.data ?? []) {
        const key = (r.email ?? "").trim().toLowerCase();
        if (!key) continue;
        depositByEmail.set(key, r.balance ?? 0);
      }

      const tourSeenEmails = new Set(
        (tourRes.data ?? []).map((r) => (r.user_email ?? "").trim().toLowerCase()).filter(Boolean)
      );

      const reviews = reviewsRes.data ?? [];
      const ratingByEmail = new Map<string, { sum: number; count: number }>();
      for (const r of reviews) {
        const key = (r.customer_email ?? "").trim().toLowerCase();
        if (!key) continue;
        const existing = ratingByEmail.get(key);
        if (existing) {
          existing.sum += r.rating;
          existing.count += 1;
        } else {
          ratingByEmail.set(key, { sum: r.rating, count: 1 });
        }
      }

      const rows: CustomerRow[] = (pointsRes.data ?? []).map((p) => {
        const key = p.email.trim().toLowerCase();
        const stats = orderStats.get(key);
        const ratingStats = ratingByEmail.get(key);
        return {
          email: p.email,
          balance: p.balance ?? 0,
          ma_id: p.ma_id,
          birthday: p.birthday,
          name: stats?.name ?? null,
          phone: stats?.phone ?? null,
          ordersCount: stats?.count ?? 0,
          lastOrderAt: stats?.lastAt ?? null,
          lifetimeEarned: earnedByEmail.get(key) ?? 0,
          depositBalance: depositByEmail.get(key) ?? 0,
          sawCabinetTour: tourSeenEmails.has(key),
          avgRating: ratingStats ? ratingStats.sum / ratingStats.count : null,
          reviewCount: ratingStats?.count ?? 0,
        };
      });

      setCustomers(rows);
      setRecentReviews(reviews.slice(0, 20));
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [profile?.role]);

  const results = customers
    .filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.email.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.ma_id ?? "").includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "balance") return b.balance - a.balance;
      if (sortBy === "orders") return b.ordersCount - a.ordersCount;
      const at = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
      const bt = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
      return bt - at;
    });

  async function loadDetail(email: string) {
    const supabase = createClient();
    const [ordersRes, pointsRes, datesRes, subRes] = await Promise.all([
      supabase
        .from("tilda_orders")
        .select("order_id, created_at, order_total, status, products_text")
        .eq("customer_email", email)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("points_transactions")
        .select("id, amount, type, order_id, description, created_at")
        .eq("user_email", email)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("personal_dates")
        .select("id, label, event_date, recurrence")
        .eq("email", email)
        .order("event_date", { ascending: true }),
      supabase
        .from("subscriptions")
        .select("status, line_name_snapshot, created_at")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setOrders(ordersRes.data ?? []);
    setPointsHistory(pointsRes.data ?? []);
    setDates(datesRes.data ?? []);
    setSubscription(subRes.data ?? null);
  }

  async function selectCustomer(customer: CustomerRow) {
    setSelected(customer);
    setLoadingDetail(true);
    setPointsAmount("");
    setPointsDescription("");
    setPointsError(null);
    setDepositAmount("");
    setDepositError(null);
    setDateLabel("");
    setDateValue("");
    setDateRecurrence("yearly");
    setDateError(null);
    setBirthdayValue(customer.birthday ?? "");
    await loadDetail(customer.email);
    setLoadingDetail(false);
  }

  function updateSelectedInList(email: string, patch: Partial<CustomerRow>) {
    setCustomers((list) => list.map((c) => (c.email === email ? { ...c, ...patch } : c)));
    setSelected((prev) => (prev && prev.email === email ? { ...prev, ...patch } : prev));
  }

  // Кто из менеджеров и что именно поменял в карточке клиента — раньше
  // это нигде не фиксировалось (points_transactions не хранит, кто именно
  // начислил баллы). Пишем в отдельный журнал, не блокируя основное
  // действие, если лог почему-то не записался.
  async function logActivity(customerEmail: string, action: string, details: string) {
    const supabase = createClient();
    await supabase.from("customer_activity_log").insert({
      actor_user_id: user.id,
      customer_email: customerEmail,
      action,
      details,
    });
  }

  async function submitPoints(sign: 1 | -1) {
    if (!selected) return;
    const value = Math.abs(Number(pointsAmount));
    if (!value) {
      setPointsError("Введите количество баллов");
      return;
    }
    setPointsSubmitting(true);
    setPointsError(null);
    const supabase = createClient();

    const { error } = await supabase.from("points_transactions").insert({
      user_email: selected.email,
      amount: value * sign,
      type: sign > 0 ? "accrual" : "redemption",
      description: pointsDescription || null,
      // null рендерится как буквальный текст "null" в шаблоне кабинета
      // клиента (там `č. ${order_id}` без проверки на пустоту).
      order_id: "",
    });

    if (error) {
      setPointsError(error.message);
      setPointsSubmitting(false);
      return;
    }

    const { data: refreshed } = await supabase
      .from("Tilda points")
      .select("balance")
      .eq("email", selected.email)
      .single();

    updateSelectedInList(selected.email, {
      balance: refreshed?.balance ?? selected.balance + value * sign,
      lifetimeEarned: selected.lifetimeEarned + (sign > 0 ? value : 0),
    });

    logActivity(
      selected.email,
      sign > 0 ? "points_accrual" : "points_redemption",
      `${value} б.${pointsDescription ? ` · ${pointsDescription}` : ""}`
    );

    setPointsAmount("");
    setPointsDescription("");
    setPointsSubmitting(false);
    await loadDetail(selected.email);
  }

  async function submitDeposit(sign: 1 | -1) {
    if (!selected) return;
    const value = Math.abs(Number(depositAmount));
    if (!value) {
      setDepositError("Введите сумму");
      return;
    }
    const newBalance = selected.depositBalance + value * sign;
    if (newBalance < 0) {
      setDepositError("Недостаточно депозита для списания");
      return;
    }
    setDepositSubmitting(true);
    setDepositError(null);
    const supabase = createClient();

    const { error } = await supabase
      .from("customer_deposits")
      .upsert({ email: selected.email, balance: newBalance, updated_at: new Date().toISOString() }, { onConflict: "email" });

    if (error) {
      setDepositError(error.message);
      setDepositSubmitting(false);
      return;
    }

    updateSelectedInList(selected.email, { depositBalance: newBalance });
    logActivity(selected.email, sign > 0 ? "deposit_topup" : "deposit_deduct", `${value} Kč`);
    setDepositAmount("");
    setDepositSubmitting(false);
  }

  async function addDate(label: string, eventDate: string, recurrence: string, logAction = "date_added") {
    if (!selected) return null;
    if (!label.trim() || !eventDate) {
      return "Заполните название и дату";
    }
    const supabase = createClient();
    const { error } = await supabase.from("personal_dates").insert({
      email: selected.email,
      label: label.trim(),
      event_date: eventDate,
      recurrence,
    });
    if (error) return error.message;
    logActivity(selected.email, logAction, `${label.trim()} — ${formatDate(eventDate)}`);
    await loadDetail(selected.email);
    return null;
  }

  async function submitDate() {
    setDateSubmitting(true);
    const err = await addDate(dateLabel, dateValue, dateRecurrence);
    setDateError(err);
    if (!err) {
      setDateLabel("");
      setDateValue("");
      setDateRecurrence("yearly");
    }
    setDateSubmitting(false);
  }

  async function submitBirthday() {
    if (!selected || !birthdayValue) return;
    setBirthdaySubmitting(true);
    const supabase = createClient();

    // День рождения храним и в "Tilda points".birthday (для отображения
    // на карточке), и добавляем как обычную важную дату — так же, как
    // клиент сам мог бы добавить её через виджет "Důležitá data", просто
    // сразу с понятным названием и ежегодным повтором.
    const { error: birthdayErr } = await supabase
      .from("Tilda points")
      .update({ birthday: birthdayValue })
      .eq("email", selected.email);

    if (!birthdayErr) {
      // Клиент видит это название в виджете важных дат на сайте — сайт
      // чешский, поэтому пишем по-чешски, а не по-русски (в отличие от
      // остального интерфейса этой страницы, который для менеджера).
      await addDate("Narozeniny", birthdayValue, "yearly", "birthday_set");
      updateSelectedInList(selected.email, { birthday: birthdayValue });
    }

    setBirthdaySubmitting(false);
  }

  async function deleteDate(id: string, label: string) {
    if (!selected) return;
    const supabase = createClient();
    await supabase.from("personal_dates").delete().eq("id", id);
    logActivity(selected.email, "date_deleted", label);
    await loadDetail(selected.email);
  }

  function stars(rating: number) {
    return "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
  }

  if (profile?.role !== "manager") {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Клиенты</h1>
        <a
          href="https://vezminarin.cz/members/login"
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          + Зарегистрировать нового клиента
        </a>
      </div>

      {recentReviews.length > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Новые отзывы ({recentReviews.length})
          </p>
          <div className="space-y-2">
            {recentReviews.map((r) => {
              const customer = customers.find((c) => c.email.toLowerCase() === r.customer_email.toLowerCase());
              return (
                <button
                  key={r.id}
                  onClick={() => customer && selectCustomer(customer)}
                  className="block w-full rounded-md border border-zinc-100 dark:border-zinc-800 p-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{customer?.name ?? r.customer_email}</span>
                    <span className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                      <span className="text-amber-500">{stars(r.rating)}</span>
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">{r.comment}</span>
                    <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">№{r.order_id}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div>
            <p className="font-medium">{selected.name ?? selected.email}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{selected.email}</p>
            {selected.phone && <p className="text-sm text-zinc-500 dark:text-zinc-400">{selected.phone}</p>}
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              № карты: {selected.ma_id ?? "—"} · баланс: {selected.balance} · всего заработано:{" "}
              {selected.lifetimeEarned}
              {selected.depositBalance > 0 && ` · депозит: ${selected.depositBalance} Kč`}
              {selected.birthday && ` · день рождения: ${formatDate(selected.birthday)}`}
              {selected.reviewCount > 0 && ` · отзывы: ${stars(selected.avgRating ?? 0)} (${selected.reviewCount})`}
            </p>
          </div>

          {/* Баллы: начислить/списать прямо на месте, без перехода на отдельную страницу */}
          <div className="rounded-md border border-zinc-100 dark:border-zinc-800 p-3">
            <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Баллы</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Количество</span>
                <input
                  type="number"
                  min="0"
                  value={pointsAmount}
                  onChange={(e) => setPointsAmount(e.target.value)}
                  className="w-28 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex-1 space-y-1 text-sm">
                <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Комментарий (виден клиенту)</span>
                <input
                  value={pointsDescription}
                  onChange={(e) => setPointsDescription(e.target.value)}
                  placeholder="например: списание за покупку в магазине"
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                />
              </label>
              <button
                onClick={() => submitPoints(1)}
                disabled={pointsSubmitting}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Начислить
              </button>
              <button
                onClick={() => submitPoints(-1)}
                disabled={pointsSubmitting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Списать
              </button>
            </div>
            {pointsError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{pointsError}</p>}
          </div>

          {/* Депозит: пополнение наличными в магазине — именно так это и описано клиенту в его кабинете */}
          <div className="rounded-md border border-zinc-100 dark:border-zinc-800 p-3">
            <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Депозит (пополнение наличными в магазине)
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Сумма, Kč</span>
                <input
                  type="number"
                  min="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-28 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                />
              </label>
              <button
                onClick={() => submitDeposit(1)}
                disabled={depositSubmitting}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Пополнить
              </button>
              <button
                onClick={() => submitDeposit(-1)}
                disabled={depositSubmitting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Списать
              </button>
            </div>
            {depositError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{depositError}</p>}
          </div>

          {loadingDetail && <p className="text-sm text-zinc-400 dark:text-zinc-500">Загрузка…</p>}

          {!loadingDetail && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Последние заказы</p>
                <div className="space-y-2">
                  {orders.map((o, i) => (
                    <div key={i} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-600 dark:text-zinc-300">
                          {formatDate(o.created_at)} · №{o.order_id ?? "—"} · {o.status ?? "—"}
                        </span>
                        <span>{o.order_total ?? 0} Kč</span>
                      </div>
                      {o.products_text && (
                        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{o.products_text}</p>
                      )}
                    </div>
                  ))}
                  {orders.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Пока нет заказов</p>}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">История баллов</p>
                <div className="space-y-1">
                  {pointsHistory.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {formatDateTime(t.created_at)} · {t.type ?? "—"}
                        {t.description ? ` · ${t.description}` : ""}
                      </span>
                      <span className={t.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {t.amount >= 0 ? "+" : ""}
                        {t.amount}
                      </span>
                    </div>
                  ))}
                  {pointsHistory.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Пока нет операций</p>}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Важные даты</p>
                <div className="space-y-1">
                  {dates.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300">{d.label}</span>
                      <span className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                        {formatDate(d.event_date)}
                        {d.recurrence === "yearly" && " · ежегодно"}
                        {d.recurrence === "monthly" && " · ежемесячно"}
                        <button
                          onClick={() => deleteDate(d.id, d.label)}
                          className="text-zinc-300 hover:text-red-600 dark:text-zinc-600 dark:hover:text-red-400"
                          title="Удалить"
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ))}
                  {dates.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Не добавлены</p>}
                </div>

                {!selected.birthday && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                    <label className="space-y-1 text-sm">
                      <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">День рождения клиента</span>
                      <input
                        type="date"
                        value={birthdayValue}
                        onChange={(e) => setBirthdayValue(e.target.value)}
                        className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <button
                      onClick={submitBirthday}
                      disabled={birthdaySubmitting || !birthdayValue}
                      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      Сохранить
                    </button>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Название (видит клиент, пишите по-чешски)
                    </span>
                    <input
                      value={dateLabel}
                      onChange={(e) => setDateLabel(e.target.value)}
                      placeholder="например: Výročí svatby"
                      className="w-40 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Дата</span>
                    <input
                      type="date"
                      value={dateValue}
                      onChange={(e) => setDateValue(e.target.value)}
                      className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Повтор</span>
                    <select
                      value={dateRecurrence}
                      onChange={(e) => setDateRecurrence(e.target.value as "once" | "monthly" | "yearly")}
                      className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    >
                      {RECURRENCE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={submitDate}
                    disabled={dateSubmitting}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Добавить
                  </button>
                </div>
                {dateError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{dateError}</p>}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Подписка</p>
                {subscription ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {subscription.line_name_snapshot ?? "—"} · {subscription.status ?? "—"}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">Нет подписки</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 space-y-1 text-sm">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Поиск по email, имени, телефону или номеру карты
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="оставьте пустым, чтобы увидеть всех"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 p-0.5">
            {(
              [
                ["recent", "Недавняя активность"],
                ["balance", "Баланс баллов"],
                ["orders", "Кол-во заказов"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`rounded px-3 py-1.5 text-sm ${
                  sortBy === key ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">Загрузка…</p>}
        {!loading && results.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">Никого не нашлось</p>
        )}

        {results.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-md border border-zinc-100 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-left text-xs text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Клиент</th>
                  <th className="px-3 py-2 font-medium">№ карты</th>
                  <th className="px-3 py-2 font-medium">Баллы</th>
                  <th className="px-3 py-2 font-medium">Заказов</th>
                  <th className="px-3 py-2 font-medium">Последний заказ</th>
                  <th className="px-3 py-2 font-medium">Депозит</th>
                  <th className="px-3 py-2 font-medium">Отзывы</th>
                  <th className="px-3 py-2 font-medium">Кабинет</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {results.map((c) => (
                  <tr
                    key={c.email}
                    onClick={() => selectCustomer(c)}
                    className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                      selected?.email === c.email ? "bg-accent/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.name ?? c.email}</div>
                      {c.name && <div className="text-xs text-zinc-400 dark:text-zinc-500">{c.email}</div>}
                      {c.phone && <div className="text-xs text-zinc-400 dark:text-zinc-500">{c.phone}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {c.ma_id ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.balance}</div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500">всего {c.lifetimeEarned}</div>
                    </td>
                    <td className="px-3 py-2">{c.ordersCount}</td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {c.depositBalance > 0 ? `${c.depositBalance} Kč` : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {c.reviewCount > 0 ? (
                        <span>
                          <span className="text-amber-500">{stars(c.avgRating ?? 0)}</span> ({c.reviewCount})
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {c.sawCabinetTour ? (
                        <span className="rounded-full bg-green-50 dark:bg-green-500/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                          видел
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
