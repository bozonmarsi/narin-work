"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ORDER_COLUMNS } from "./queries";
import { statusColor, statusLabel } from "@/lib/order-status";
import {
  addDays,
  addMonths,
  endOfMonth,
  orderTimeRange,
  startOfMonth,
  startOfWeek,
  toDateKey,
  todayUTC,
  MONTH_LABELS,
  WEEKDAY_LABELS,
} from "@/lib/schedule";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import type { OrderRow } from "./types";

type ViewMode = "day" | "week" | "month";

const HOUR_START = 7;
const HOUR_END = 21;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

export function CalendarView({
  onSelect,
  refreshSignal,
}: {
  onSelect: (order: OrderRow) => void;
  refreshSignal?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [currentDate, setCurrentDate] = useState(() => todayUTC());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // No setLoading(true) — see the same note in CourierView.tsx.
    const supabase = createClient();

    let rangeStart: Date;
    let rangeEndExclusive: Date;
    if (viewMode === "day") {
      rangeStart = currentDate;
      rangeEndExclusive = addDays(currentDate, 1);
    } else if (viewMode === "week") {
      rangeStart = startOfWeek(currentDate);
      rangeEndExclusive = addDays(rangeStart, 7);
    } else {
      rangeStart = startOfMonth(currentDate);
      rangeEndExclusive = addDays(endOfMonth(currentDate), 1);
    }

    const { data, error } = await supabase
      .from("tilda_orders")
      .select(ORDER_COLUMNS)
      .gte("delivery_date", toDateKey(rangeStart))
      .lt("delivery_date", toDateKey(rangeEndExclusive))
      .order("delivery_date", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setOrders((data as unknown as OrderRow[]) ?? []);
    }
    setLoading(false);
  }, [viewMode, currentDate]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshSignal]);

  useRealtimeRefresh("tilda_orders", load);

  function step(direction: 1 | -1) {
    if (viewMode === "day") setCurrentDate((d) => addDays(d, direction));
    else if (viewMode === "week") setCurrentDate((d) => addDays(d, direction * 7));
    else setCurrentDate((d) => addMonths(d, direction));
  }

  const byDate = new Map<string, OrderRow[]>();
  for (const order of orders) {
    if (!order.delivery_date) continue;
    const key = order.delivery_date.slice(0, 10);
    const list = byDate.get(key) ?? [];
    list.push(order);
    byDate.set(key, list);
  }

  if (!expanded) {
    const todayOrders = byDate.get(toDateKey(todayUTC())) ?? [];
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Сегодня, {formatTitle("day", todayUTC())}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {loading ? "Загрузка…" : `${todayOrders.length} заказ(ов)`}
            </p>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Развернуть календарь ↓
          </button>
        </div>
        {!loading && todayOrders.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {todayOrders.slice(0, 8).map((o) => (
              <button
                key={o.id}
                onClick={() => onSelect(o)}
                className={`rounded-md border px-2 py-1 text-left text-xs hover:border-accent ${statusColor(o.status)} border-transparent`}
              >
                {o.subscription_id && "🔁 "}#{o.order_id} · {o.customer_name}
              </button>
            ))}
            {todayOrders.length > 8 && (
              <span className="self-center text-xs text-zinc-400 dark:text-zinc-500">+{todayOrders.length - 8} ещё</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
            ←
          </button>
          <button
            onClick={() => setCurrentDate(todayUTC())}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Сегодня
          </button>
          <button onClick={() => step(1)} className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
            →
          </button>
          <h2 className="ml-2 text-base font-semibold">{formatTitle(viewMode, currentDate)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 p-0.5">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`rounded px-3 py-1 text-sm ${
                  viewMode === mode ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {mode === "day" ? "День" : mode === "week" ? "Неделя" : "Месяц"}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setExpanded(false);
              setViewMode("day");
              setCurrentDate(todayUTC());
            }}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Свернуть ↑
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 dark:text-red-400">Ошибка загрузки: {error}</p>}
      {loading ? (
        <p className="text-zinc-500 dark:text-zinc-400">Загрузка…</p>
      ) : viewMode === "day" ? (
        <DayView date={currentDate} orders={byDate.get(toDateKey(currentDate)) ?? []} onSelect={onSelect} />
      ) : viewMode === "week" ? (
        <WeekView
          weekStart={startOfWeek(currentDate)}
          byDate={byDate}
          onSelect={onSelect}
        />
      ) : (
        <MonthView
          month={currentDate}
          byDate={byDate}
          onSelectDay={(d) => {
            setCurrentDate(d);
            setViewMode("day");
          }}
          onSelectOrder={onSelect}
        />
      )}
    </div>
  );
}

function formatTitle(viewMode: ViewMode, date: Date) {
  if (viewMode === "month") {
    return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
  if (viewMode === "week") {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${start.getUTCDate()} ${MONTH_LABELS[start.getUTCMonth()].slice(0, 3)} – ${end.getUTCDate()} ${MONTH_LABELS[end.getUTCMonth()].slice(0, 3)} ${end.getUTCFullYear()}`;
  }
  return `${date.getUTCDate()} ${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function OrderChip({ order, onSelect, compact }: { order: OrderRow; onSelect: (o: OrderRow) => void; compact?: boolean }) {
  return (
    <button
      onClick={() => onSelect(order)}
      className={`w-full rounded-md border px-2 py-1 text-left text-xs hover:border-accent ${statusColor(order.status)} border-transparent`}
    >
      <span className="font-medium">#{order.order_id}</span> {order.subscription_id && "🔁 "}
      {order.customer_name} → {order.recipient_name}
      {order.products_text && <span className="block text-zinc-500 dark:text-zinc-400">{order.products_text}</span>}
      {!compact && order.assigned_courier?.full_name && <span> · {order.assigned_courier.full_name}</span>}
    </button>
  );
}

function DayView({
  date,
  orders,
  onSelect,
}: {
  date: Date;
  orders: OrderRow[];
  onSelect: (order: OrderRow) => void;
}) {
  const untimed: OrderRow[] = [];
  const byHour = new Map<number, OrderRow[]>();

  for (const order of orders) {
    const range = orderTimeRange(order.delivery_slot, order.delivery_time_raw);
    if (!range) {
      untimed.push(order);
      continue;
    }
    const hour = Math.max(HOUR_START, Math.min(HOUR_END, Math.floor(range.start)));
    const list = byHour.get(hour) ?? [];
    list.push(order);
    byHour.set(hour, list);
  }

  return (
    <div>
      {untimed.length > 0 && (
        <div className="mb-3 space-y-1 rounded-md bg-zinc-50 dark:bg-zinc-800 p-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Без указанного времени</p>
          {untimed.map((o) => (
            <OrderChip key={o.id} order={o} onSelect={onSelect} />
          ))}
        </div>
      )}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {HOURS.map((hour) => {
          const hourOrders = byHour.get(hour) ?? [];
          return (
            <div key={hour} className="flex gap-3 py-2">
              <div className="w-14 shrink-0 pt-1 text-sm text-zinc-400 dark:text-zinc-500">{hour}:00</div>
              <div className="flex-1 space-y-1">
                {hourOrders.length === 0 ? (
                  <div className="h-6" />
                ) : (
                  hourOrders.map((o) => <OrderChip key={o.id} order={o} onSelect={onSelect} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
      {orders.length === 0 && <p className="mt-4 text-zinc-500 dark:text-zinc-400">На этот день заказов нет.</p>}
    </div>
  );
}

function WeekView({
  weekStart,
  byDate,
  onSelect,
}: {
  weekStart: Date;
  byDate: Map<string, OrderRow[]>;
  onSelect: (order: OrderRow) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {days.map((day) => {
        const key = toDateKey(day);
        const dayOrders = (byDate.get(key) ?? []).slice().sort((a, b) => {
          const ra = orderTimeRange(a.delivery_slot, a.delivery_time_raw)?.start ?? 99;
          const rb = orderTimeRange(b.delivery_slot, b.delivery_time_raw)?.start ?? 99;
          return ra - rb;
        });
        return (
          <div key={key} className="min-h-[100px] rounded-md border border-zinc-100 dark:border-zinc-800 p-2">
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {WEEKDAY_LABELS[(day.getUTCDay() + 6) % 7]} {day.getUTCDate()}
            </p>
            <div className="space-y-1">
              {dayOrders.map((o) => (
                <OrderChip key={o.id} order={o} onSelect={onSelect} compact />
              ))}
              {dayOrders.length === 0 && <p className="text-xs text-zinc-300 dark:text-zinc-600">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  month,
  byDate,
  onSelectDay,
  onSelectOrder,
}: {
  month: Date;
  byDate: Map<string, OrderRow[]>;
  onSelectDay: (date: Date) => void;
  onSelectOrder: (order: OrderRow) => void;
}) {
  const firstOfMonth = startOfMonth(month);
  const gridStart = startOfWeek(firstOfMonth);
  const lastOfMonth = endOfMonth(month);
  const gridEnd = addDays(startOfWeek(lastOfMonth), 7);
  const dayCount = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000);
  const days = Array.from({ length: dayCount }, (_, i) => addDays(gridStart, i));

  return (
    <div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-2">
        {days.map((day) => {
          const key = toDateKey(day);
          const dayOrders = byDate.get(key) ?? [];
          const inMonth = day.getUTCMonth() === month.getUTCMonth();
          const hasAttention = dayOrders.some((o) => o.problem_reported || o.transfer_requested);
          return (
            <div
              key={key}
              className={`min-h-[80px] rounded-md border p-1.5 text-left ${
                inMonth ? "border-zinc-100 dark:border-zinc-800" : "border-transparent opacity-40"
              }`}
            >
              <button
                onClick={() => onSelectDay(day)}
                className="mb-1 flex w-full items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-accent"
              >
                <span>{day.getUTCDate()}</span>
                {dayOrders.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      hasAttention ? "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400" : "bg-accent/10 text-accent"
                    }`}
                  >
                    {dayOrders.length}
                  </span>
                )}
              </button>
              <div className="space-y-0.5">
                {dayOrders.slice(0, 2).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => onSelectOrder(o)}
                    className="block w-full truncate rounded bg-zinc-50 dark:bg-zinc-800 px-1 py-0.5 text-left text-[10px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    #{o.order_id}
                  </button>
                ))}
                {dayOrders.length > 2 && (
                  <p className="px-1 text-[10px] text-zinc-400 dark:text-zinc-500">+{dayOrders.length - 2} ещё</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
