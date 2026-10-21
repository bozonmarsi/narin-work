"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { formatDate } from "@/lib/format";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type Voucher = {
  id: string;
  code: string;
  amount: number | null;
  status: "inactive" | "active" | "claimed" | "expired" | "void";
  batch: string | null;
  note: string | null;
  created_at: string;
  activated_at: string | null;
  activation_method: string | null;
  purchaser_email: string | null;
  expires_at: string | null;
  claimed_at: string | null;
  claimed_by_email: string | null;
  void_reason: string | null;
};

const STATUS_LABEL: Record<Voucher["status"], string> = {
  inactive: "Не включён",
  active: "Включён",
  claimed: "Погашен",
  expired: "Истёк",
  void: "Аннулирован",
};

const STATUS_HINT: Record<Voucher["status"], string> = {
  inactive: "напечатан, но не продан, не работает",
  active: "продан, ждёт, пока клиент отсканирует",
  claimed: "клиент получил деньги на депозит",
  expired: "срок вышел, деньги сгорели",
  void: "отменён менеджером",
};

const STATUS_STYLE: Record<Voucher["status"], string> = {
  inactive: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
  active: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400",
  claimed: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  expired: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400",
  void: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",
};

const METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "transfer", label: "Перевод" },
  { value: "gift", label: "Подарок от нас (без оплаты)" },
];

const AMOUNT_PRESETS = [500, 1000, 1500, 2000, 3000];

const CLAIM_URL = "https://vezminarin.cz/poukaz?c=";

function money(n: number | null) {
  return n == null ? "—" : `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
}

function describeError(message: string): string {
  if (message.includes("voucher_not_found")) return "Такого кода нет. Проверьте, что ввели его без ошибок.";
  if (message.includes("voucher_not_inactive_active")) return "Этот сертификат уже включён.";
  if (message.includes("voucher_not_inactive_claimed")) return "Этот сертификат уже погашен клиентом.";
  if (message.includes("voucher_not_inactive_void")) return "Этот сертификат аннулирован.";
  if (message.includes("voucher_not_inactive_expired")) return "У этого сертификата истёк срок.";
  if (message.includes("amount_required")) return "Укажите сумму.";
  if (message.includes("amount_mismatch")) return "Сумма не совпадает с номиналом, напечатанным на карточке.";
  if (message.includes("voucher_cannot_void")) return "Этот сертификат уже нельзя аннулировать (он погашен или истёк).";
  if (message.includes("forbidden")) return "Нет прав (нужна роль менеджера).";
  if (message.includes("count_1_500")) return "Количество от 1 до 500.";
  return message;
}

// Подарочные сертификаты (poukazy): партия сертификатов с уникальными кодами,
// менеджер включает сертификат по коду (сумма + способ оплаты, срок 12 месяцев
// с этого момента), клиент потом сканирует QR на /poukaz — сумма сразу
// зачисляется на его депозит и сгорает в тот же день, что и сам сертификат.
export default function VouchersPage() {
  const { profile } = useDashboard();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Voucher["status"]>("all");
  const [search, setSearch] = useState("");

  const [actCode, setActCode] = useState("");
  const [actAmount, setActAmount] = useState("");
  const [actMethod, setActMethod] = useState("cash");
  const [actEmail, setActEmail] = useState("");
  const [actNote, setActNote] = useState("");
  const [actBusy, setActBusy] = useState(false);
  const [actMsg, setActMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [batchCount, setBatchCount] = useState("20");
  const [batchPrefix, setBatchPrefix] = useState("NR");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchCodes, setBatchCodes] = useState<string[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("gift_vouchers")
      .select(
        "id, code, amount, status, batch, note, created_at, activated_at, activation_method, purchaser_email, expires_at, claimed_at, claimed_by_email, void_reason",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    setVouchers((data as Voucher[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh("gift_vouchers", load);

  const counts = useMemo(() => {
    const c = { inactive: 0, active: 0, claimed: 0, expired: 0, void: 0 };
    vouchers.forEach((v) => {
      c[v.status] += 1;
    });
    return c;
  }, [vouchers]);

  const activeSum = useMemo(
    () => vouchers.filter((v) => v.status === "active").reduce((s, v) => s + (v.amount ?? 0), 0),
    [vouchers],
  );

  const actCard = useMemo(() => {
    const q = actCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (q.length < 8) return null;
    return vouchers.find((x) => x.code.replace(/-/g, "") === q) ?? null;
  }, [actCode, vouchers]);

  // Номинал, напечатанный на карточке и записанный в базу: его менять нельзя.
  const actPreset = actCard && actCard.status === "inactive" ? actCard.amount : null;

  const actFound = useMemo(() => {
    const q = actCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (q.length < 8) return null;
    if (!actCard) return { kind: "warn" as const, text: "Такого кода нет в списке." };
    if (actCard.status === "inactive") {
      return {
        kind: "ok" as const,
        text:
          actCard.amount != null
            ? `Код найден, сертификат ещё не включён. Номинал на карточке: ${money(actCard.amount)}.`
            : "Код найден, сертификат ещё не включён.",
      };
    }
    return { kind: "warn" as const, text: `Код найден, но статус: ${STATUS_LABEL[actCard.status]}.` };
  }, [actCode, actCard]);

  const shown = useMemo(() => {
    const q = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return vouchers.filter((v) => {
      if (filter !== "all" && v.status !== filter) return false;
      if (q && !v.code.replace(/-/g, "").includes(q)) return false;
      return true;
    });
  }, [vouchers, filter, search]);

  if (profile?.role !== "manager") {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Раздел доступен только менеджеру.</p>;
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setActMsg(null);
    const amount = actPreset != null ? null : actAmount ? Number(actAmount) : null;
    if (!actCode.trim()) {
      setActMsg({ ok: false, text: "Введите код сертификата." });
      return;
    }
    setActBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("activate_voucher", {
      p_code: actCode,
      p_amount: amount,
      p_method: actMethod,
      p_purchaser_email: actEmail || null,
      p_note: actNote || null,
    });
    setActBusy(false);
    if (error) {
      setActMsg({ ok: false, text: describeError(error.message) });
      return;
    }
    const v = data as Voucher;
    setActMsg({
      ok: true,
      text: `Сертификат ${v.code} включён на ${money(v.amount)}. Действует до ${formatDate(v.expires_at)}.`,
    });
    setActCode("");
    setActAmount("");
    setActEmail("");
    setActNote("");
    load();
  }

  async function createBatch(e: React.FormEvent) {
    e.preventDefault();
    setBatchError(null);
    setBatchCodes([]);
    setBatchBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_voucher_batch", {
      p_count: Number(batchCount),
      p_prefix: batchPrefix || "NR",
    });
    setBatchBusy(false);
    if (error) {
      setBatchError(describeError(error.message));
      return;
    }
    setBatchCodes(((data as { voucher_code: string }[]) ?? []).map((r) => r.voucher_code));
    load();
  }

  async function voidVoucher(v: Voucher) {
    const reason = window.prompt(`Аннулировать сертификат ${v.code}? Укажите причину (можно пусто):`, "");
    if (reason === null) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("void_voucher", { p_code: v.code, p_reason: reason });
    if (error) {
      window.alert(describeError(error.message));
      return;
    }
    load();
  }

  function downloadCsv() {
    const rows = ["code;url", ...batchCodes.map((c) => `${c};${CLAIM_URL}${c}`)];
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sertifikaty-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const inputCls =
    "w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Подарочные сертификаты</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Пластиковая карточка или письмо с уникальным кодом и QR. Пока вы не включили сертификат, он ничего не стоит.
        </p>
        <Link
          href="/dashboard/vouchers/print"
          className="mt-2 inline-block rounded-lg border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Печать карточек с QR
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["1", "Напечатать", "Партия уже создана (новая нужна редко). Нажмите «Печать карточек с QR»: коды и QR попадают на карточки, суммы нет."],
          ["2", "Продать и включить", "Клиент заплатил: введите код с карточки, сумму и способ оплаты. С этого дня идут 12 месяцев."],
          ["3", "Клиент сканирует QR", "Сумма сразу попадает на его депозит и сгорает в тот же день, что и сертификат."],
        ].map(([n, t, d]) => (
          <div key={n} className="flex gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
              {n}
            </span>
            <div>
              <p className="text-sm font-medium">{t}</p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{d}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(Object.keys(STATUS_LABEL) as Voucher["status"][]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(filter === s ? "all" : s)}
            className={`rounded-xl border px-3 py-2 text-left ${
              filter === s ? "border-accent" : "border-zinc-200 dark:border-zinc-700"
            } bg-white dark:bg-zinc-900`}
          >
            <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{STATUS_LABEL[s]}</p>
            <p className="text-lg font-semibold">{counts[s]}</p>
            <p className="text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">{STATUS_HINT[s]}</p>
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Продано, но ещё не получено клиентами: {money(activeSum)}. Это ваше обязательство перед клиентами.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={activate}
          className="space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4"
        >
          <h2 className="text-sm font-semibold">Включить сертификат (клиент заплатил)</h2>
          <input
            value={actCode}
            onChange={(e) => setActCode(e.target.value.toUpperCase())}
            placeholder="Код с карточки, например NR-7K4Q-2M9X"
            className={`${inputCls} font-mono`}
            autoComplete="off"
          />
          {actFound && (
            <p
              className={`text-xs ${
                actFound.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-orange-600 dark:text-orange-400"
              }`}
            >
              {actFound.text}
            </p>
          )}
          {actPreset != null ? (
            <p className="rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm">
              Сумма по карточке: <b>{money(actPreset)}</b> (её менять нельзя)
            </p>
          ) : (
            <div>
              <div className="flex flex-wrap gap-1.5">
                {AMOUNT_PRESETS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => setActAmount(String(a))}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      actAmount === String(a)
                        ? "border-accent bg-accent text-white"
                        : "border-zinc-300 dark:border-zinc-600"
                    }`}
                  >
                    {a} Kč
                  </button>
                ))}
              </div>
              <input
                value={actAmount}
                onChange={(e) => setActAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Сумма, Kč"
                inputMode="numeric"
                className={`${inputCls} mt-2`}
              />
            </div>
          )}
          <select value={actMethod} onChange={(e) => setActMethod(e.target.value)} className={inputCls}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            value={actEmail}
            onChange={(e) => setActEmail(e.target.value)}
            placeholder="Email покупателя (необязательно)"
            className={inputCls}
          />
          <input
            value={actNote}
            onChange={(e) => setActNote(e.target.value)}
            placeholder="Заметка (необязательно)"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={actBusy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {actBusy ? "Включаем…" : "Включить сертификат"}
          </button>
          {actMsg && (
            <p
              className={`text-sm ${
                actMsg.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {actMsg.text}
            </p>
          )}
        </form>

        <details className="self-start rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Дополнительно: создать новую партию (редко)</summary>
        <form onSubmit={createBatch} className="mt-3 space-y-3">
          <div className="flex gap-2">
            <input
              value={batchCount}
              onChange={(e) => setBatchCount(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Сколько"
              inputMode="numeric"
              className={inputCls}
            />
            <input
              value={batchPrefix}
              onChange={(e) => setBatchPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
              placeholder="Префикс"
              className={`${inputCls} font-mono`}
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Сумма не нужна: она ставится, когда вы включаете сертификат. Новые сертификаты не включены.
          </p>
          <button
            type="submit"
            disabled={batchBusy}
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {batchBusy ? "Создаём…" : "Создать партию"}
          </button>
          {batchError && <p className="text-sm text-red-600 dark:text-red-400">{batchError}</p>}
          {batchCodes.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Создано {batchCodes.length}. Эти коды печатаются на карточках, они же в QR:</p>
              <div className="max-h-40 overflow-auto rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2 font-mono text-xs">
                {batchCodes.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(batchCodes.join("\n"))}
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs"
                >
                  Скопировать коды
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-xs"
                >
                  Скачать CSV (код + ссылка для QR)
                </button>
              </div>
            </div>
          )}
        </form>
        </details>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по коду"
            className="w-56 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          />
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="text-xs text-accent">
              показать все
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Сертификатов нет.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Код</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Сумма</th>
                  <th className="px-3 py-2">Включён</th>
                  <th className="px-3 py-2">Действует до</th>
                  <th className="px-3 py-2">Получен клиентом</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2 font-mono text-xs">{v.code}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[v.status]}`}>
                        {STATUS_LABEL[v.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{money(v.amount)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {v.activated_at ? formatDate(v.activated_at) : "—"}
                      {v.activation_method ? ` · ${METHODS.find((m) => m.value === v.activation_method)?.label ?? v.activation_method}` : ""}
                      {v.purchaser_email ? ` · ${v.purchaser_email}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs">{v.expires_at ? formatDate(v.expires_at) : "—"}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {v.claimed_at ? `${formatDate(v.claimed_at)} · ${v.claimed_by_email ?? ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => navigator.clipboard.writeText(`${CLAIM_URL}${v.code}`)}
                        className="mr-2 text-xs text-accent"
                        title="Скопировать ссылку для QR"
                      >
                        ссылка
                      </button>
                      {(v.status === "inactive" || v.status === "active") && (
                        <button onClick={() => voidVoucher(v)} className="text-xs text-red-600 dark:text-red-400">
                          аннулировать
                        </button>
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
