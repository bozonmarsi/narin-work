"use client";

// Соответствия «наш цветок ↔ сорт Van Vliet», проверка по фото.
//
// Одна строка на цветок; нажатие раскрывает связи. У связи лента мелких
// фото всех вариантов этого сорта у Van Vliet; тап по фото — крупно, там
// же «этот вариант не подходит» (короче / хуже / другой производитель).
//   ✓ — связь проверена: по ней считается наличие на сайте и себестоимость.
//   ✗ — не он: отклонено навсегда, ИИ больше не предложит.
// Все подтверждённые связи равноправны. Себестоимость = самый дешёвый из
// подтверждённых вариантов в наличии (иначе последняя известная цена)
// × 1,21 DPH × штук в охапке. Всё пишется в журнал (alias_events).
// Кнопки меняют экран сразу, без перезагрузки списка.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities, formatDateTime } from "@/lib/format";
import { useDashboard } from "../layout";

const DPH = 1.21;

type Product = {
  id: string;
  product_name: string;
  image_url: string | null;
  price: number | null;
  order_unit_size: number | null;
};
type Alias = {
  id: string;
  alias: string;
  product_sticker_id: string;
  status: "suggested" | "approved" | "rejected";
  source: string;
  note: string | null;
  reviewed_at: string | null;
};
type Variant = {
  sig: string;
  product: string;
  core: string;
  color: string | null;
  quality: string | null;
  grower: string | null;
  photo: string | null;
  order_per: number | null;
  price: number | null;
  stock: number | null;
  last_in_stock_at: string | null;
};
type Filter = "review" | "conflict" | "nolink" | "all";

const VARIANT_COLS = "sig, product, core, color, quality, grower, photo, order_per, price, stock, last_in_stock_at";
const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
const withDph = (n: number) => (n * DPH).toFixed(1).replace(".", ",");
const coreOf = (a: Alias) => a.alias.trim().toLowerCase();
const isChecked = (a: Alias) => a.status === "approved" && !!a.reviewed_at;
const toCheck = (a: Alias) => a.status === "suggested" || (a.status === "approved" && !a.reviewed_at);

export default function MatchingPage() {
  const { profile } = useDashboard();
  const [products, setProducts] = useState<Product[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [blocks, setBlocks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("review");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [zoom, setZoom] = useState<{ v: Variant; p: Product } | null>(null);
  const [linkFor, setLinkFor] = useState<Product | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: sup } = await supabase.from("suppliers").select("id").eq("name", "Van Vliet").maybeSingle();
    const [p, a, b] = await Promise.all([
      supabase.from("product_stickers").select("id, product_name, image_url, price, order_unit_size").eq("category", "ohapka").eq("archived", false).order("product_name"),
      supabase
        .from("product_name_aliases")
        .select("id, alias, product_sticker_id, status, source, note, reviewed_at")
        .eq("supplier_id", sup?.id ?? "00000000-0000-0000-0000-000000000000"),
      supabase.from("vv_variant_blocks").select("sig, product_sticker_id"),
    ]);
    if (p.error || a.error) {
      setError((p.error || a.error)?.message ?? "load_failed");
      setLoading(false);
      return;
    }
    const al = (a.data ?? []) as Alias[];
    const cores = Array.from(new Set(al.map(coreOf)));
    const { data: vv } = cores.length ? await supabase.from("vv_catalog").select(VARIANT_COLS).in("core", cores) : { data: [] };
    setProducts((p.data ?? []) as Product[]);
    setAliases(al);
    setVariants((vv ?? []) as Variant[]);
    setBlocks(new Set((b.data ?? []).map((x: { sig: string; product_sticker_id: string }) => `${x.product_sticker_id}#${x.sig}`)));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load from Supabase, same as the other warehouse tabs
    load();
  }, [load]);

  const byCore = useMemo(() => {
    const m = new Map<string, Variant[]>();
    for (const v of variants) m.set(v.core, [...(m.get(v.core) ?? []), v]);
    for (const list of m.values()) list.sort((x, y) => Number((y.stock ?? 0) > 0) - Number((x.stock ?? 0) > 0) || (x.price ?? 1e9) - (y.price ?? 1e9));
    return m;
  }, [variants]);

  const aliasesByProduct = useMemo(() => {
    const m = new Map<string, Alias[]>();
    for (const a of aliases) m.set(a.product_sticker_id, [...(m.get(a.product_sticker_id) ?? []), a]);
    return m;
  }, [aliases]);

  const owners = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of aliases) if (a.status !== "rejected") m.set(coreOf(a), [...(m.get(coreOf(a)) ?? []), a.product_sticker_id]);
    return m;
  }, [aliases]);

  const nameOf = useMemo(() => new Map(products.map((p) => [p.id, decodeHtmlEntities(p.product_name)])), [products]);

  const infos = useMemo(() => {
    function summarize(p: Product) {
      const list = aliasesByProduct.get(p.id) ?? [];
      const approved = list.filter((a) => a.status === "approved");
      const pool = approved.flatMap((a) => byCore.get(coreOf(a)) ?? []).filter((v) => !blocks.has(`${p.id}#${v.sig}`) && (v.price ?? 0) > 0);
      const live = pool.filter((v) => (v.stock ?? 0) > 0);
      const prices = (live.length ? live : pool).map((v) => v.price as number);
      const stem = prices.length ? Math.min(...prices) : null;
      const stemMax = prices.length ? Math.max(...prices) : null;
      const cost = stem != null ? stem * DPH * (p.order_unit_size || 1) : null;
      return {
        list,
        stem,
        stemMax,
        old: !live.length && pool.length > 0,
        cost,
        margin: cost != null && p.price ? p.price - cost : null,
        review: list.some(toCheck),
        conflict: list.some((a) => a.status !== "rejected" && (owners.get(coreOf(a))?.length ?? 0) > 1),
        noLink: !approved.length,
        checked: list.filter(isChecked).length,
        pending: list.filter(toCheck).length,
      };
    }
    const m = new Map<string, ReturnType<typeof summarize>>();
    for (const p of products) m.set(p.id, summarize(p));
    return m;
  }, [products, aliasesByProduct, byCore, blocks, owners]);

  const counts = useMemo(() => {
    const all = Array.from(infos.values());
    return {
      review: all.filter((i) => i.review).length,
      conflict: all.filter((i) => i.conflict).length,
      nolink: all.filter((i) => i.noLink).length,
      all: products.length,
    };
  }, [infos, products.length]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const i = infos.get(p.id)!;
      if (q && !decodeHtmlEntities(p.product_name).toLowerCase().includes(q) && !i.list.some((a) => a.alias.toLowerCase().includes(q))) return false;
      if (filter === "review") return i.review;
      if (filter === "conflict") return i.conflict;
      if (filter === "nolink") return i.noLink;
      return true;
    });
  }, [products, infos, filter, query]);

  // --- действия: сразу меняем экран, база в фоне; при ошибке — откат ---
  async function act(a: Alias, action: "approve" | "reject") {
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt(`Почему «${a.alias}» — не ${nameOf.get(a.product_sticker_id)}? (можно пусто)`, "");
      if (note === null) return;
    }
    const before = aliases;
    const now = new Date().toISOString();
    setAliases((list) =>
      list.map((x) => (x.id === a.id ? { ...x, status: action === "approve" ? "approved" : "rejected", reviewed_at: now, note: note || x.note } : x)),
    );
    const { error: err } = await createClient().rpc("alias_review", { p_alias_id: a.id, p_action: action, p_note: note || null });
    if (err) {
      setAliases(before);
      setError(err.message);
    }
  }
  async function approveAll(p: Product) {
    for (const a of (aliasesByProduct.get(p.id) ?? []).filter(toCheck)) await act(a, "approve");
  }
  async function toggleBlock(p: Product, v: Variant) {
    const key = `${p.id}#${v.sig}`;
    const blocked = blocks.has(key);
    let note: string | null = null;
    if (!blocked) {
      note = window.prompt("Почему этот вариант не подходит? (короче, хуже качество, другой производитель…)", "");
      if (note === null) return;
    }
    const before = blocks;
    setBlocks((s) => {
      const n = new Set(s);
      if (blocked) n.delete(key);
      else n.add(key);
      return n;
    });
    const { error: err } = await createClient().rpc("vv_variant_block", { p_sig: v.sig, p_product: p.id, p_blocked: !blocked, p_note: note || null });
    if (err) {
      setBlocks(before);
      setError(err.message);
    }
  }
  async function scanNow() {
    setScanning(true);
    setError(null);
    const { data, error: fnErr } = await createClient().functions.invoke("vanvliet-stock-scan", { body: {} });
    if (fnErr || data?.ok === false) setError(fnErr?.message ?? "Сканер Van Vliet не ответил");
    await load();
    setScanning(false);
  }
  function toggleOpen(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (profile && profile.role !== "manager") return <p className="p-6 text-sm text-zinc-500">Только для менеджера.</p>;
  if (loading) return <p className="p-6 text-sm text-zinc-500">Загружаю соответствия…</p>;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "review", label: "Проверить" },
    { key: "conflict", label: "Конфликты" },
    { key: "nolink", label: "Без связи" },
    { key: "all", label: "Все" },
  ];
  const expandAll = filter === "review";

  return (
    <div className="mx-auto max-w-5xl space-y-3 pb-16">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Соответствия Van Vliet</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск"
          className="w-44 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={scanNow}
          disabled={scanning}
          className="rounded-lg border border-zinc-300 px-2.5 py-1 text-sm hover:border-accent hover:text-accent disabled:opacity-50 dark:border-zinc-700"
        >
          {scanning ? "Читаю каталог…" : "↻ Каталог VV"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              filter === f.key ? "bg-accent text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {f.label} {counts[f.key]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-xs text-zinc-500">
          <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> отклонённые
        </label>
      </div>
      <p className="text-[11px] text-zinc-500">
        Себестоимость = самый дешёвый подтверждённый сорт в наличии × 1,21 DPH × штук в охапке. ✓ — проверено, ✗ — не он. Тап по фото — крупно и «вариант не
        подходит».
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300" onClick={() => setError(null)}>
          {error}
        </p>
      )}
      {rows.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">Здесь всё проверено 👌</p>}

      <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {rows.map((p) => {
          const i = infos.get(p.id)!;
          const name = nameOf.get(p.id) ?? p.product_name;
          const isOpen = expandAll ? !open.has(p.id) : open.has(p.id);
          const pct = i.margin != null && p.price ? Math.round((i.margin / p.price) * 100) : null;
          const links = i.list
            .filter((a) => showRejected || a.status !== "rejected")
            .sort((x, y) => Number(toCheck(y)) - Number(toCheck(x)) || x.alias.localeCompare(y.alias));
          return (
            <div key={p.id}>
              <button onClick={() => toggleOpen(p.id)} className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md bg-zinc-100 object-cover dark:bg-zinc-800" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-800" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {p.order_unit_size ?? 1} шт · сайт {p.price ? kc(p.price) : "—"}
                    {i.cost != null && (
                      <>
                        {" "}
                        · себест. {kc(i.cost)}
                        {i.old ? " (старая цена)" : ""}
                      </>
                    )}
                  </p>
                </div>
                {pct != null && (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${pct < 45 ? "bg-red-50 text-red-600 dark:bg-red-500/10" : "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"}`}>
                    {pct} %
                  </span>
                )}
                <span className="flex shrink-0 gap-1 text-[11px]">
                  {i.checked > 0 && <span className="rounded bg-green-100 px-1 text-green-700 dark:bg-green-500/20 dark:text-green-300">✓{i.checked}</span>}
                  {i.pending > 0 && <span className="rounded bg-yellow-100 px-1 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200">?{i.pending}</span>}
                  {i.conflict && <span className="rounded bg-red-100 px-1 text-red-700 dark:bg-red-500/20 dark:text-red-300">!</span>}
                </span>
                <span className="shrink-0 text-zinc-400">{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (
                <div className="space-y-1.5 px-2.5 pb-2.5">
                  {i.stem != null && (
                    <p className="text-[11px] text-zinc-500">
                      стебель {i.stem === i.stemMax ? i.stem : `${i.stem}–${i.stemMax}`} Kč + 21 % = {withDph(i.stem)} Kč × {p.order_unit_size ?? 1} шт
                      {i.margin != null ? ` · маржа ${kc(i.margin)}` : ""}
                    </p>
                  )}
                  {links.map((a) => {
                    const vs = byCore.get(coreOf(a)) ?? [];
                    const others = (owners.get(coreOf(a)) ?? []).filter((id) => id !== p.id);
                    return (
                      <div
                        key={a.id}
                        className={`rounded-lg border px-2 py-1.5 ${
                          a.status === "rejected"
                            ? "border-zinc-200 opacity-50 dark:border-zinc-800"
                            : isChecked(a)
                              ? "border-green-200 dark:border-green-500/30"
                              : "border-yellow-300 dark:border-yellow-500/40"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {a.alias}
                            {a.source === "ai" && <span className="ml-1 text-zinc-400">· ИИ</span>}
                            {a.note && <span className="ml-1 text-zinc-400">· «{a.note}»</span>}
                            {others.length > 0 && <span className="ml-1 text-red-600">· тоже у {others.map((id) => nameOf.get(id)).join(", ")}</span>}
                          </span>
                          {a.status === "rejected" ? (
                            <button onClick={() => act(a, "approve")} className="rounded border border-zinc-300 px-1.5 text-xs dark:border-zinc-600">
                              вернуть
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => act(a, "approve")}
                                disabled={isChecked(a)}
                                title="Это он"
                                className={`h-7 w-8 rounded text-sm font-bold ${
                                  isChecked(a) ? "bg-green-600 text-white" : "border border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10"
                                }`}
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => act(a, "reject")}
                                title="Не он"
                                className="h-7 w-8 rounded border border-red-300 text-sm font-bold text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
                              >
                                ✗
                              </button>
                            </>
                          )}
                        </div>
                        {a.status !== "rejected" && (
                          <div className="mt-1 flex gap-1.5 overflow-x-auto pb-0.5">
                            {vs.length === 0 && <span className="text-[11px] text-zinc-400">сейчас нет в каталоге VV</span>}
                            {vs.map((v) => {
                              const bl = blocks.has(`${p.id}#${v.sig}`);
                              return (
                                <button key={v.sig} onClick={() => setZoom({ v, p })} className={`relative w-14 shrink-0 text-left ${bl ? "opacity-40" : ""}`}>
                                  {v.photo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.photo} alt="" loading="lazy" className="h-14 w-14 rounded bg-zinc-100 object-cover dark:bg-zinc-800" />
                                  ) : (
                                    <div className="h-14 w-14 rounded bg-zinc-100 dark:bg-zinc-800" />
                                  )}
                                  {bl && <span className="absolute inset-x-0 top-3 text-center text-lg font-bold text-red-600">✗</span>}
                                  <span className={`block truncate text-[10px] leading-tight ${(v.stock ?? 0) > 0 ? "" : "text-zinc-400"}`}>
                                    {v.price != null ? `${withDph(v.price)} Kč` : "—"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex gap-2">
                    {i.pending > 1 && (
                      <button onClick={() => approveAll(p)} className="rounded border border-green-500 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                        ✓ все {i.pending}
                      </button>
                    )}
                    <button onClick={() => setLinkFor(p)} className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:border-accent hover:text-accent dark:border-zinc-600">
                      + сорт из каталога
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setZoom(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-3 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            {zoom.v.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={zoom.v.photo} alt={zoom.v.product} className="max-h-[55vh] w-full rounded-lg bg-zinc-100 object-contain dark:bg-zinc-800" />
            )}
            <p className="mt-2 text-sm font-medium">{zoom.v.product}</p>
            <p className="text-xs text-zinc-500">{[zoom.v.color, zoom.v.quality, zoom.v.grower].filter(Boolean).join(" · ")}</p>
            <p className="text-xs">
              {zoom.v.price != null ? `${withDph(zoom.v.price)} Kč/шт с DPH (${zoom.v.price} без)` : ""}
              {zoom.v.order_per ? ` · по ${zoom.v.order_per} шт` : ""} ·{" "}
              {(zoom.v.stock ?? 0) > 0 ? `есть ${zoom.v.stock}` : zoom.v.last_in_stock_at ? `был ${formatDateTime(zoom.v.last_in_stock_at)}` : "нет"}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  toggleBlock(zoom.p, zoom.v);
                  setZoom(null);
                }}
                className={`rounded-lg py-2 text-sm font-medium ${blocks.has(`${zoom.p.id}#${zoom.v.sig}`) ? "bg-zinc-200 dark:bg-zinc-700" : "border border-red-300 text-red-600"}`}
              >
                {blocks.has(`${zoom.p.id}#${zoom.v.sig}`) ? "Снова подходит" : "Не подходит"}
              </button>
              <button onClick={() => setZoom(null)} className="rounded-lg bg-zinc-100 py-2 text-sm dark:bg-zinc-800">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {linkFor && <LinkDialog product={linkFor} onClose={() => setLinkFor(null)} onLinked={load} />}
    </div>
  );
}

function LinkDialog({ product, onClose, onLinked }: { product: Product; onClose: () => void; onLinked: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Variant[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = decodeHtmlEntities(product.product_name);

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim();
      if (s.length < 2) {
        setFound([]);
        return;
      }
      const { data } = await createClient().from("vv_catalog").select(VARIANT_COLS).ilike("product", `%${s}%`).order("stock", { ascending: false }).limit(40);
      setFound((data ?? []) as Variant[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function link(v: Variant) {
    setBusy(true);
    setErr(null);
    const { error } = await createClient().rpc("alias_link", { p_product: product.id, p_vv_name: v.product, p_note: null });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await onLinked();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-3 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold">Привязать к «{name}»</p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="rosa, eust, paeonia, calla…"
          className="mt-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        <div className="mt-2 grid flex-1 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-5">
          {found.map((v) => (
            <button
              key={v.sig}
              disabled={busy}
              onClick={() => link(v)}
              className="rounded-lg border border-zinc-200 p-1 text-left text-[10px] hover:border-accent disabled:opacity-50 dark:border-zinc-700"
            >
              {v.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.photo} alt="" loading="lazy" className="h-20 w-full rounded bg-zinc-100 object-cover dark:bg-zinc-800" />
              ) : (
                <div className="h-20 rounded bg-zinc-100 dark:bg-zinc-800" />
              )}
              <p className="mt-0.5 line-clamp-2 font-medium leading-tight">{v.product}</p>
              <p className="text-zinc-500">{v.price != null ? `${withDph(v.price)} Kč` : "—"}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
