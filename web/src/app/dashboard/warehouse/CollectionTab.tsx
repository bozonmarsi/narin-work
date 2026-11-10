"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";
import { Modal } from "./Modal";
import { normName, purchasePlan, scaleLines, type Line, type Size } from "./collectionMath";

// Коллекция букетов флориста: он придумывает состав свободным текстом,
// включает размеры S/M/L и подтверждает каждый, ставит цену и план на
// неделю. Внизу — сводный список закупки по этому плану.

type SizeState = { id?: string; size: Size; enabled: boolean; confirmed: boolean; price: string; planned: string; lines: Line[]; suggested?: boolean };
type Bouquet = { id: string; working_name: string; name: string | null; sticker_url: string | null; status: string; note: string | null; sizes: SizeState[] };
type Stock = { name: string; quantity: number | null; order_unit_size: number | null };

const SIZES: Size[] = ["S", "M", "L"];
const STATUS_LABEL: Record<string, string> = { draft: "Черновик", ready: "Готов", live: "На сайте", archived: "В архиве" };

function emptySizes(): SizeState[] {
  return SIZES.map((s) => ({ size: s, enabled: s === "M", confirmed: false, price: "", planned: "0", lines: s === "M" ? [{ flower_name: "", qty: 1 }] : [] }));
}

export function CollectionTab() {
  const [bouquets, setBouquets] = useState<Bouquet[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Bouquet | null>(null);
  const [view, setView] = useState<"list" | "buy">("list");
  const [spare, setSpare] = useState("10");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const [b, s, l, st] = await Promise.all([
      supabase.from("collection_bouquets").select("id, working_name, name, sticker_url, status, note").neq("status", "archived").order("created_at", { ascending: false }),
      supabase.from("collection_bouquet_sizes").select("id, bouquet_id, size, enabled, confirmed, price, planned_qty"),
      supabase.from("collection_bouquet_lines").select("size_id, flower_name, qty, sort").order("sort"),
      supabase.from("product_stickers").select("product_name, quantity, order_unit_size, category").eq("archived", false),
    ]);
    if (b.error) setError(b.error.message);
    const linesBy = new Map<string, Line[]>();
    (l.data ?? []).forEach((r) => linesBy.set(r.size_id, [...(linesBy.get(r.size_id) ?? []), { flower_name: r.flower_name, qty: r.qty }]));
    setBouquets((b.data ?? []).map((row) => ({
      ...row,
      sizes: SIZES.map((sz) => {
        const r = (s.data ?? []).find((x) => x.bouquet_id === row.id && x.size === sz);
        return r
          ? { id: r.id, size: sz, enabled: r.enabled, confirmed: r.confirmed, price: r.price?.toString() ?? "", planned: String(r.planned_qty ?? 0), lines: linesBy.get(r.id) ?? [] }
          : { size: sz, enabled: false, confirmed: false, price: "", planned: "0", lines: [] };
      }),
    })));
    setStock((st.data ?? []).filter((x) => x.category === "ohapka").map((x) => ({ name: decodeHtmlEntities(x.product_name), quantity: x.quantity, order_unit_size: x.order_unit_size })));
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load from Supabase, same as the other warehouse tabs
    load();
  }, []);

  const suggestions = useMemo(() => {
    const set = new Map<string, string>();
    stock.forEach((s) => set.set(normName(s.name), s.name));
    bouquets.forEach((b) => b.sizes.forEach((s) => s.lines.forEach((l) => l.flower_name.trim() && set.set(normName(l.flower_name), l.flower_name.trim()))));
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [stock, bouquets]);

  const plan = useMemo(() => purchasePlan(
    bouquets.filter((b) => b.status === "ready" || b.status === "live").flatMap((b) => b.sizes.map((s) => ({ size: s.size, enabled: s.enabled, confirmed: s.confirmed, planned_qty: parseInt(s.planned) || 0, lines: s.lines }))),
    stock, parseFloat(spare) || 0,
  ), [bouquets, stock, spare]);

  if (loading) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1">
        {(["list", "buy"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${view === v ? "bg-white dark:bg-zinc-900 shadow-sm" : "text-zinc-500"}`}>
            {v === "list" ? "Букеты" : "Закупка"}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {view === "list" ? (
        <>
          <button
            onClick={() => setEditing({ id: "", working_name: "", name: null, sticker_url: null, status: "draft", note: "", sizes: emptySizes() })}
            className="w-full rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:border-accent hover:text-accent"
          >
            + Новый букет
          </button>
          {bouquets.length === 0 && <p className="text-sm text-zinc-500">Пока ни одного букета. Придумайте первый.</p>}
          {bouquets.map((b) => (
            <button key={b.id} onClick={() => setEditing(JSON.parse(JSON.stringify(b)))} className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 text-left hover:border-accent">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.sticker_url ? <img src={b.sticker_url} alt="" className="h-full w-full object-contain" /> : "💐"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.name || b.working_name}</p>
                <div className="mt-1 flex gap-1">
                  {b.sizes.filter((s) => s.enabled).map((s) => (
                    <span key={s.size} className={`rounded px-1.5 text-[10px] font-semibold ${s.confirmed ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"}`}>
                      {s.size}{s.confirmed ? " ✓" : " ?"}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-zinc-500">{STATUS_LABEL[b.status] ?? b.status}</span>
            </button>
          ))}
        </>
      ) : (
        <PurchaseView plan={plan} spare={spare} setSpare={setSpare} />
      )}

      {editing && (
        <BouquetEditor
          initial={editing}
          suggestions={suggestions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function PurchaseView({ plan, spare, setSpare }: { plan: ReturnType<typeof purchasePlan>; spare: string; setSpare: (v: string) => void }) {
  const [copied, setCopied] = useState(false);
  const text = plan.filter((r) => r.toBuy > 0).map((r) => `${r.name}: ${r.toBuy} шт.${r.packs ? ` (${r.packs} уп. по ${r.pack})` : ""}`).join("\n");
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Считается по готовым букетам: подтверждённые размеры × план на неделю. Из нужного количества вычитается остаток на складе.
      </p>
      <label className="flex items-center gap-2 text-xs">
        Запас на брак
        <input inputMode="numeric" value={spare} onChange={(e) => setSpare(e.target.value)} className="w-14 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-right" />
        %
      </label>
      {plan.length === 0 ? (
        <p className="text-sm text-zinc-500">Нет плана: отметьте букет готовым, подтвердите размеры и поставьте план.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500">
              <tr><th className="px-2 py-2 text-left font-medium">Цветок</th><th className="px-2 text-right font-medium">Нужно</th><th className="px-2 text-right font-medium">Есть</th><th className="px-2 text-right font-medium">Купить</th></tr>
            </thead>
            <tbody>
              {plan.map((r) => (
                <tr key={r.name} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-2">{r.name}</td>
                  <td className="px-2 text-right tabular-nums" title={`${r.need} по плану + запас`}>{r.withSpare}</td>
                  <td className="px-2 text-right tabular-nums text-zinc-500">{r.stock || "—"}</td>
                  <td className="px-2 text-right font-semibold tabular-nums">{r.toBuy}{r.packs ? <span className="block text-[10px] font-normal text-zinc-500">{r.packs} уп. × {r.pack}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {text && (
        <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">
          {copied ? "Скопировано" : "Скопировать список"}
        </button>
      )}
    </div>
  );
}

function BouquetEditor({ initial, suggestions, onClose, onSaved }: { initial: Bouquet; suggestions: string[]; onClose: () => void; onSaved: () => void }) {
  const [b, setB] = useState<Bouquet>(initial);
  const [active, setActive] = useState<Size>("M");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const size = b.sizes.find((s) => s.size === active)!;
  const base = b.sizes.find((s) => s.size === "M")!;

  function patchSize(sz: Size, patch: Partial<SizeState>) {
    setB((x) => ({ ...x, sizes: x.sizes.map((s) => (s.size === sz ? { ...s, ...patch } : s)) }));
  }
  // Любая правка состава или цены снимает подтверждение размера.
  function editLines(lines: Line[]) { patchSize(active, { lines, confirmed: false, suggested: false }); }

  function toggle(sz: Size) {
    const s = b.sizes.find((x) => x.size === sz)!;
    if (sz === "M") return;
    if (s.enabled) { patchSize(sz, { enabled: false, confirmed: false }); if (active === sz) setActive("M"); return; }
    const lines = s.lines.length ? s.lines : scaleLines(base.lines, "M", sz);
    const price = s.price || (parseFloat(base.price) > 0 ? String(Math.round((parseFloat(base.price) * (sz === "S" ? 0.65 : 1.5)) / 10) * 10) : "");
    patchSize(sz, { enabled: true, confirmed: false, lines, price, suggested: !s.lines.length });
    setActive(sz);
  }

  async function save(nextStatus?: string) {
    setError(null);
    if (!b.working_name.trim()) return setError("Дайте букету рабочее название");
    if (!base.lines.some((l) => l.flower_name.trim() && l.qty > 0)) return setError("Добавьте хотя бы один цветок в размер M");
    const status = nextStatus ?? b.status;
    if (status === "ready" && !base.confirmed) return setError("Сначала подтвердите размер M");
    setSaving(true);
    const supabase = createClient();
    try {
      let id = b.id;
      if (id) {
        const r = await supabase.from("collection_bouquets").update({ working_name: b.working_name.trim(), note: b.note || null, status }).eq("id", id);
        if (r.error) throw r.error;
      } else {
        const r = await supabase.from("collection_bouquets").insert({ working_name: b.working_name.trim(), note: b.note || null, status }).select("id").single();
        if (r.error) throw r.error;
        id = r.data.id;
      }
      for (const s of b.sizes) {
        if (!s.enabled && !s.id) continue;
        const row = { bouquet_id: id, size: s.size, enabled: s.enabled, confirmed: s.enabled && s.confirmed, price: parseFloat(s.price) > 0 ? parseFloat(s.price) : null, planned_qty: Math.max(0, parseInt(s.planned) || 0) };
        const r = await supabase.from("collection_bouquet_sizes").upsert(row, { onConflict: "bouquet_id,size" }).select("id").single();
        if (r.error) throw r.error;
        const del = await supabase.from("collection_bouquet_lines").delete().eq("size_id", r.data.id);
        if (del.error) throw del.error;
        const lines = s.lines.filter((l) => l.flower_name.trim() && l.qty > 0).map((l, i) => ({ size_id: r.data.id, flower_name: l.flower_name.trim(), qty: Math.round(l.qty), sort: i }));
        if (lines.length) {
          const ins = await supabase.from("collection_bouquet_lines").insert(lines);
          if (ins.error) throw ins.error;
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  async function archive() {
    if (!b.id || !confirm("Убрать букет в архив?")) return;
    const supabase = createClient();
    await supabase.from("collection_bouquets").update({ status: "archived" }).eq("id", b.id);
    onSaved();
  }

  const stems = size.lines.reduce((a, l) => a + (l.qty || 0), 0);

  return (
    <Modal title={b.id ? b.working_name || "Букет" : "Новый букет"} onClose={onClose} wide>
      <div className="space-y-4">
        <input
          value={b.working_name}
          onChange={(e) => setB({ ...b, working_name: e.target.value })}
          placeholder="Рабочее название, например «Пионы с эвкалиптом»"
          className="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2.5 text-base font-medium outline-none focus:border-accent"
        />

        <div className="flex gap-2">
          {b.sizes.map((s) => (
            <div key={s.size} className={`flex flex-1 items-center rounded-xl border ${active === s.size ? "border-accent" : "border-zinc-200 dark:border-zinc-700"} ${s.enabled ? "" : "opacity-60"}`}>
              <button onClick={() => (s.enabled ? setActive(s.size) : toggle(s.size))} className="flex-1 px-3 py-2 text-left">
                <span className="block text-base font-semibold">{s.size}</span>
                <span className="block text-[11px] text-zinc-500">
                  {!s.enabled ? "включить" : s.confirmed ? "подтверждён ✓" : s.suggested ? "предложен, проверьте" : "не подтверждён"}
                </span>
              </button>
              {s.size !== "M" && s.enabled && (
                <button onClick={() => toggle(s.size)} title="Выключить размер" className="px-2 text-zinc-400 hover:text-red-500">✕</button>
              )}
            </div>
          ))}
        </div>

        {size.enabled && (
          <div className="space-y-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3">
            {size.suggested && (
              <p className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                Состав предложен автоматически от размера M. Поправьте как нужно и подтвердите.
              </p>
            )}
            <datalist id="collection-flowers">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
            {size.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  list="collection-flowers"
                  value={l.flower_name}
                  onChange={(e) => editLines(size.lines.map((x, j) => (j === i ? { ...x, flower_name: e.target.value } : x)))}
                  placeholder="Цветок, например «Роза Avalanche»"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm outline-none focus:border-accent"
                />
                <div className="flex items-center rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900">
                  <button onClick={() => editLines(size.lines.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} className="px-2.5 py-2 text-zinc-500">−</button>
                  <input
                    inputMode="numeric"
                    value={l.qty}
                    onChange={(e) => editLines(size.lines.map((x, j) => (j === i ? { ...x, qty: Math.max(0, parseInt(e.target.value) || 0) } : x)))}
                    className="w-9 bg-transparent text-center text-sm tabular-nums outline-none"
                  />
                  <button onClick={() => editLines(size.lines.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))} className="px-2.5 py-2 text-zinc-500">+</button>
                </div>
                <button onClick={() => editLines(size.lines.filter((_, j) => j !== i))} className="px-1 text-zinc-400 hover:text-red-500" aria-label="Убрать">✕</button>
              </div>
            ))}
            <button onClick={() => editLines([...size.lines, { flower_name: "", qty: 1 }])} className="text-sm font-medium text-accent">+ Цветок</button>
            <p className="text-[11px] text-zinc-500">Всего стеблей: {stems}</p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-300">
                Цена, Kč
                <input inputMode="numeric" value={size.price} onChange={(e) => patchSize(active, { price: e.target.value, confirmed: false })} className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm" />
              </label>
              <label className="text-xs text-zinc-600 dark:text-zinc-300">
                План на неделю, шт.
                <input inputMode="numeric" value={size.planned} onChange={(e) => patchSize(active, { planned: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm" />
              </label>
            </div>

            <button
              onClick={() => patchSize(active, { confirmed: !size.confirmed, suggested: false })}
              disabled={!size.lines.some((x) => x.flower_name.trim()) || !(parseFloat(size.price) > 0)}
              className={`w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 ${size.confirmed ? "bg-green-600 text-white" : "border border-green-600 text-green-700 dark:text-green-400"}`}
            >
              {size.confirmed ? `Размер ${active} подтверждён ✓` : `Подтвердить размер ${active}`}
            </button>
          </div>
        )}

        <textarea
          value={b.note ?? ""}
          onChange={(e) => setB({ ...b, note: e.target.value })}
          rows={2}
          placeholder="Заметка для себя: упаковка, лента, идея"
          className="w-full rounded-xl border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {b.id && <button onClick={archive} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-red-600">В архив</button>}
          <div className="flex-1" />
          <button onClick={() => save()} disabled={saving} className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm font-medium">Сохранить</button>
          {b.status === "draft" && (
            <button onClick={() => save("ready")} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              {saving ? "Сохраняю…" : "Готов для коллекции"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
