// Mirrors the date-placement algorithm in
// supabase/functions/stripe-subscription-webhook/index.ts — spreads `count`
// deliveries evenly across a 28-day cycle from anchorDateStr, nudging any
// date that lands on a closed day forward to the next open day, or backward
// if that forward nudge would collide with the next delivery.

const CYCLE_DAYS = 28;

function addDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function toKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isClosed(date: Date, closedWeekdays: Set<number>, closedDates: Set<string>) {
  return closedWeekdays.has(date.getUTCDay()) || closedDates.has(toKey(date));
}

function shiftForward(date: Date, closedWeekdays: Set<number>, closedDates: Set<string>) {
  let d = date;
  while (isClosed(d, closedWeekdays, closedDates)) d = addDays(d, 1);
  return d;
}

function shiftBackward(date: Date, closedWeekdays: Set<number>, closedDates: Set<string>) {
  let d = date;
  while (isClosed(d, closedWeekdays, closedDates)) d = addDays(d, -1);
  return d;
}

export function generateOccurrenceDates(
  anchorDateStr: string,
  count: number,
  closedWeekdays: Set<number>,
  closedDates: Set<string>,
): string[] {
  const anchor = new Date(anchorDateStr + "T00:00:00Z");
  const raw: Date[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.round((i * CYCLE_DAYS) / count);
    raw.push(addDays(anchor, offset));
  }

  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    let candidate = shiftForward(raw[i], closedWeekdays, closedDates);
    const nextRaw = i < count - 1 ? raw[i + 1] : null;
    if (nextRaw && candidate.getTime() >= nextRaw.getTime()) {
      candidate = shiftBackward(raw[i], closedWeekdays, closedDates);
    }
    result.push(toKey(candidate));
  }
  return result;
}
