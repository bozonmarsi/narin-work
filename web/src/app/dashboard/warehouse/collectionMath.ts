// Чистая логика коллекции букетов: подбор состава для S/L по основному
// размеру и сводный список закупки. Без браузера, чтобы проверять тестом.

export type Size = "S" | "M" | "L";
export type Line = { flower_name: string; qty: number };
export type PlannedSize = { size: Size; enabled: boolean; confirmed: boolean; planned_qty: number; lines: Line[] };
export type StockItem = { name: string; quantity: number | null; order_unit_size: number | null };
export type PurchaseRow = { name: string; need: number; withSpare: number; stock: number; toBuy: number; pack: number | null; packs: number | null };

export const SIZE_FACTOR: Record<Size, number> = { S: 0.65, M: 1, L: 1.5 };

export function normName(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

// Предложение для другого размера: пропорционально основному составу,
// не меньше одного стебля каждого цветка.
export function scaleLines(base: Line[], from: Size, to: Size): Line[] {
  const k = SIZE_FACTOR[to] / SIZE_FACTOR[from];
  return base.filter((l) => l.flower_name.trim() && l.qty > 0).map((l) => ({ flower_name: l.flower_name.trim(), qty: Math.max(1, Math.round(l.qty * k)) }));
}

// Сколько стеблей нужно на план: только включённые и подтверждённые размеры.
// Запас на брак добавляется до вычета остатка; закупка округляется до упаковки.
export function purchasePlan(sizes: PlannedSize[], stock: StockItem[], sparePct: number): PurchaseRow[] {
  const need = new Map<string, { name: string; qty: number }>();
  for (const s of sizes) {
    if (!s.enabled || !s.confirmed || s.planned_qty <= 0) continue;
    for (const l of s.lines) {
      const key = normName(l.flower_name);
      if (!key || !(l.qty > 0)) continue;
      const cur = need.get(key) ?? { name: l.flower_name.trim(), qty: 0 };
      cur.qty += l.qty * s.planned_qty;
      need.set(key, cur);
    }
  }
  const byName = new Map(stock.map((s) => [normName(s.name), s]));
  return [...need.entries()]
    .map(([key, n]) => {
      const st = byName.get(key);
      const withSpare = Math.ceil(n.qty * (1 + Math.max(0, sparePct) / 100));
      const have = Math.max(0, st?.quantity ?? 0);
      const toBuy = Math.max(0, withSpare - have);
      const pack = st?.order_unit_size && st.order_unit_size > 1 ? st.order_unit_size : null;
      return { name: n.name, need: n.qty, withSpare, stock: have, toBuy, pack, packs: pack ? Math.ceil(toBuy / pack) : null };
    })
    .sort((a, b) => b.toBuy - a.toBuy || a.name.localeCompare(b.name));
}
