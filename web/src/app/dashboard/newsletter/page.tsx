"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Stats = {
  total: number;
  subscribed: number;
  unsubscribed: number;
  bySource: { source: string; count: number }[];
  subscribedEmails: string[];
};

const SOURCE_LABELS: Record<string, string> = {
  order_soft_optin: "Заказы (автоматически)",
  signup_form: "Форма на сайте",
  manual: "Вручную",
};

export default function NewsletterPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailsText, setEmailsText] = useState("");
  const [source, setSource] = useState("signup_form");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("newsletter_subscribers").select("email, status, source");
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const bySourceMap = new Map<string, number>();
    for (const r of rows) bySourceMap.set(r.source, (bySourceMap.get(r.source) ?? 0) + 1);
    setStats({
      total: rows.length,
      subscribed: rows.filter((r) => r.status === "subscribed").length,
      unsubscribed: rows.filter((r) => r.status === "unsubscribed").length,
      bySource: Array.from(bySourceMap.entries()).map(([source, count]) => ({ source, count })),
      subscribedEmails: rows.filter((r) => r.status === "subscribed").map((r) => r.email),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleImport() {
    const emails = emailsText
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      setError("Вставьте хотя бы один email");
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Нет активной сессии");

      const res = await fetch("/api/newsletter/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ emails, source }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Не удалось импортировать");

      setResult(
        `Добавлено новых: ${data.inserted} · уже было в базе: ${data.skippedExisting} · невалидных пропущено: ${data.submitted - data.validEmails}`,
      );
      setEmailsText("");
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setImporting(false);
    }
  }

  function handleExportCsv() {
    if (!stats) return;
    const csv = ["email", ...stats.subscribedEmails].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `narin-newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="text-zinc-500 dark:text-zinc-400">Загрузка…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Рассылка</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Список согласий для маркетинговых писем (не транзакционных — те приходят всегда, независимо от этого
          списка). Сами письма и их дизайн — не здесь: собирайте и отправляйте кампанию в Brevo (Campaigns), там же
          будет видно, кому дошло, кто открыл и кто кликнул. Эта страница — только источник правды по адресам и
          согласиям: кто подписан, кто отписался через нашу страницу /odhlaseni.
        </p>
      </div>

      {stats && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-6 text-sm">
              <div>
                <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{stats.subscribed}</div>
                <div className="text-zinc-500 dark:text-zinc-400">подписаны</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-zinc-400 dark:text-zinc-500">{stats.unsubscribed}</div>
                <div className="text-zinc-500 dark:text-zinc-400">отписались</div>
              </div>
            </div>
            <button
              onClick={handleExportCsv}
              disabled={stats.subscribed === 0}
              className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Экспорт CSV для Brevo
            </button>
          </div>
          {stats.bySource.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {stats.bySource.map((s) => (
                <span
                  key={s.source}
                  className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-zinc-600 dark:text-zinc-300"
                >
                  {SOURCE_LABELS[s.source] ?? s.source}: {s.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-100">Импорт email</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Например, лиды с формы «Chci vědět první» на заглушке — она живёт в самой Tilda (Formy), сюда её саму не
          затянуть, экспортируйте оттуда и вставьте адреса ниже (через запятую, пробел или с новой строки).
        </p>
        <textarea
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          placeholder="jana@example.com, petr@example.com..."
          rows={6}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100"
        />
        <div className="flex items-center gap-3">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-sm text-zinc-900 dark:text-zinc-100"
          >
            <option value="signup_form">Источник: форма на сайте</option>
            <option value="manual">Источник: вручную</option>
          </select>
          <button
            onClick={handleImport}
            disabled={importing}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {importing ? "Импортируем…" : "Импортировать"}
          </button>
        </div>
        {result && <p className="text-sm text-green-600 dark:text-green-400">{result}</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
