"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { formatDateTime } from "@/lib/format";

type Customer = {
  id: string;
  email: string;
  balance: number | null;
  ma_id: string | null;
};

type Transaction = {
  id: string;
  amount: number;
  type: string | null;
  order_id: string | null;
  description: string | null;
  created_at: string | null;
  user_email: string | null;
};

export default function PointsPage() {
  const { profile } = useDashboard();
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [lifetimeEarned, setLifetimeEarned] = useState<Record<string, number>>({});
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [selectedLifetimeEarned, setSelectedLifetimeEarned] = useState<number | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded once (not per search/sort) — search and sort now happen entirely
  // client-side over the full list, because "lifetime earned" is an
  // aggregate over points_transactions, not a column the DB can sort by
  // directly without a dedicated view. With everyone already in memory,
  // filtering/sorting in JS is simpler than standing one up, and search
  // becomes instant instead of round-tripping per keystroke.
  useEffect(() => {
    if (profile?.role !== "manager") return;
    let active = true;
    setSearching(true);
    const supabase = createClient();

    (async () => {
      const { data: customers, error } = await supabase
        .from("Tilda points")
        .select("id, email, balance, ma_id")
        .limit(5000);

      if (!active || error) {
        if (active) setSearching(false);
        return;
      }
      setAllCustomers(customers ?? []);

      const emails = (customers ?? []).map((c) => c.email).filter(Boolean);
      if (emails.length > 0) {
        const { data: earnedRows } = await supabase
          .from("points_transactions")
          .select("user_email, amount")
          .in("user_email", emails)
          .gt("amount", 0);
        if (active) {
          const totals: Record<string, number> = {};
          for (const row of earnedRows ?? []) {
            if (!row.user_email) continue;
            totals[row.user_email] = (totals[row.user_email] ?? 0) + row.amount;
          }
          setLifetimeEarned(totals);
        }
      }
      if (active) setSearching(false);
    })();

    return () => {
      active = false;
    };
  }, [profile?.role]);

  const results = allCustomers
    .filter((c) => !search.trim() || c.email?.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const diff = (lifetimeEarned[a.email] ?? 0) - (lifetimeEarned[b.email] ?? 0);
      return sortDir === "asc" ? diff : -diff;
    });

  async function loadHistory(customer: Customer) {
    setLoadingHistory(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("points_transactions")
      .select("id, amount, type, order_id, description, created_at, user_email")
      .eq("user_email", customer.email)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error) setHistory(data ?? []);
    setLoadingHistory(false);
  }

  async function loadLifetimeEarned(customer: Customer) {
    const supabase = createClient();
    // Not limited to the last 30 like `history` — a real all-time total,
    // otherwise a customer with more than 30 transactions would show a
    // truncated (wrong) sum instead of what they actually earned overall.
    const { data, error } = await supabase
      .from("points_transactions")
      .select("amount")
      .eq("user_email", customer.email)
      .gt("amount", 0);
    if (!error) {
      const total = (data ?? []).reduce((sum, r) => sum + r.amount, 0);
      setSelectedLifetimeEarned(total);
      setLifetimeEarned((prev) => ({ ...prev, [customer.email]: total }));
    }
  }

  async function refreshBalance(email: string) {
    const supabase = createClient();
    const { data } = await supabase.from("Tilda points").select("id, email, balance, ma_id").eq("email", email).single();
    if (data) {
      setSelected(data);
      // Keep the already-loaded list in sync too, instead of leaving it
      // showing a stale balance until the next full page reload.
      setAllCustomers((list) => list.map((c) => (c.email === email ? data : c)));
    }
  }

  function selectCustomer(customer: Customer) {
    setSelected(customer);
    setAmount("");
    setDescription("");
    setError(null);
    setSelectedLifetimeEarned(null);
    loadHistory(customer);
    loadLifetimeEarned(customer);
  }

  async function handleSubmit(sign: 1 | -1) {
    if (!selected) return;
    const value = Math.abs(Number(amount));
    if (!value) {
      setError("Введите количество баллов");
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const signedAmount = value * sign;

    const { error: insertError } = await supabase.from("points_transactions").insert({
      user_email: selected.email,
      amount: signedAmount,
      type: sign > 0 ? "accrual" : "redemption",
      description: description || null,
      // null renders as the literal text "null" in the client cabinet's
      // template (it does `č. ${order_id}` with no fallback) — empty
      // string at least leaves that blank instead.
      order_id: "",
    });

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    setAmount("");
    setDescription("");
    setSubmitting(false);
    await Promise.all([refreshBalance(selected.email), loadHistory(selected), loadLifetimeEarned(selected)]);
  }

  if (profile?.role !== "manager") {
    return null;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Баллы клиентов</h1>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 space-y-1 text-sm">
            <span className="text-xs font-medium text-zinc-500">Поиск по email</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="оставьте пустым, чтобы увидеть всех"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-1 rounded-md border border-zinc-200 p-0.5">
            <button
              onClick={() => setSortDir("desc")}
              className={`rounded px-3 py-1.5 text-sm ${
                sortDir === "desc" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              Больше всего накоплено
            </button>
            <button
              onClick={() => setSortDir("asc")}
              className={`rounded px-3 py-1.5 text-sm ${
                sortDir === "asc" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              Меньше всего накоплено
            </button>
          </div>
        </div>

        {searching && <p className="mt-2 text-sm text-zinc-400">Загрузка…</p>}

        {!searching && results.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400">Никого не нашлось</p>
        )}

        {results.length > 0 && (
          <div className="mt-3 max-h-80 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-100">
            {results.map((c, i) => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                  selected?.id === c.id ? "bg-accent/5" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-zinc-400">{i + 1}</span>
                  {c.email}
                </span>
                <span className="text-right">
                  <span className="block font-medium">{lifetimeEarned[c.email] ?? 0} накоплено всего</span>
                  <span className="block text-xs text-zinc-400">баланс сейчас: {c.balance ?? 0}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{selected.email}</p>
              <p className="text-sm text-zinc-500">Текущий баланс: {selected.balance ?? 0} баллов</p>
              <p className="text-sm text-zinc-500">
                Всего заработано за всё время:{" "}
                {selectedLifetimeEarned === null ? "…" : selectedLifetimeEarned}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-zinc-500">Количество баллов</span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex-1 space-y-1 text-sm">
              <span className="block text-xs font-medium text-zinc-500">Комментарий (виден клиенту)</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="например: компенсация за испорченный букет"
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              onClick={() => handleSubmit(1)}
              disabled={submitting}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Начислить
            </button>
            <button
              onClick={() => handleSubmit(-1)}
              disabled={submitting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Списать
            </button>
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div>
            <p className="mb-2 text-sm font-medium text-zinc-500">История</p>
            {loadingHistory && <p className="text-sm text-zinc-400">Загрузка…</p>}
            <div className="space-y-1">
              {history.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600">
                    {formatDateTime(t.created_at)} · {t.type ?? "—"}
                    {t.order_id ? ` · заказ #${t.order_id}` : ""}
                    {t.description ? ` · ${t.description}` : ""}
                  </span>
                  <span className={t.amount >= 0 ? "text-green-600" : "text-red-600"}>
                    {t.amount >= 0 ? "+" : ""}
                    {t.amount}
                  </span>
                </div>
              ))}
              {!loadingHistory && history.length === 0 && (
                <p className="text-sm text-zinc-400">Пока нет операций</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
