// Parses the free-text time fields Tilda sends ("9-12" slot ranges, or an
// exact "09:10" pickup time) into hour numbers so orders can be positioned
// on an hourly grid. Falls back to null when nothing parseable is found —
// callers group those into an "without time" bucket instead of guessing.

export function parseSlotRange(slot: string | null): { start: number; end: number } | null {
  if (!slot) return null;
  const m = slot.match(/^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
}

export function parseExactHour(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/^\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour + minute / 60;
}

export function orderTimeRange(
  slot: string | null,
  exactTime: string | null,
): { start: number; end: number } | null {
  const range = parseSlotRange(slot);
  if (range) return range;
  const point = parseExactHour(exactTime);
  if (point !== null) return { start: point, end: point + 1 };
  return null;
}

// delivery_date is stored as UTC midnight representing a calendar date with
// no real time-of-day meaning, so all navigation here works in UTC terms —
// mixing in local-timezone date math would shift orders onto the wrong day.

export function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(date: Date) {
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -day);
}

export function addDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

export function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const MONTH_LABELS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
