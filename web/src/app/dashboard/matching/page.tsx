"use client";

// Соответствия «наш цветок ↔ сорт Van Vliet» с фото.
//
// Каждая связь проверяется глазами: слева наш товар, справа все варианты
// этого сорта из каталога Van Vliet (фото, качество, производитель, цена
// за стебель, сколько в упаковке). Кнопки:
//   ✓ Это он   — связь проверена, по ней считается наличие на сайте;
//   ⭐ Основной — сорт, который реально покупаем, по нему себестоимость;
//   ✗ Не он    — отклонено навсегда, ИИ больше не предложит;
//   у отдельного варианта «не подходит» — то же название, но короче /
//   хуже качеством / другой производитель.
// Всё пишется в журнал (alias_events). Каталог Van Vliet наполняет
// сканер (vanvliet-stock-scan) 4 раза в день.

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
  price_markup_multiplier: number | null;
  manually_hidden: boolean;
  vanvliet_in_stock: boolean | null;
};
type Alias = {
  id: string;
  alias: string;
  product_sticker_id: string;
  status: "suggested" | "approved" | "rejected";
  is_primary: boolean;
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
  last_seen: string;
  last_in_stock_at: string | null;
};
type Block = { sig: string; product_sticker_id: string; note: string | null };
type Event = { id: number; at: string; product_sticker_id: string | null; alias: string | null; sig: string | null; action: string; note: string | null };

type Filter = "review" | "noprimary" | "conflict" | "nolink" | "all";

const ACTION_LABEL: Record<string, string> = {
  approve: "✓ подтвердила",
  reject: "✗ отклонила",
  primary: "⭐ основной",
  unprimary: "снят основной",
  link: "привязала",
  block_variant: "вариант не подходит",
  unblock_variant: "вариант снова подходит",
};

const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;

function needsReview(a: Alias) {
  return a.status === "suggested" || (a.status === "approved" && !a.reviewed_at);
}

export default function MatchingPage() {
  const { profile } = useDashboard();
  const [products, setProducts] = useState<Product[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("review");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Variant | null>(null);
  const [linkFor, setLinkFor] = useState<Product | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: sup } = await supabase.from("suppliers").select("id").eq("name", "Van Vliet").maybeSingle();
    const [p, a, b, e] = await Promise.all([
      supabase
        .from("product_stickers")
        .select("id, product_name, image_url, price, order_unit_size, price_markup_multiplier, manually_hidden, vanvliet_in_stock")
        .eq("category", "ohapka")
        .eq("archived", false)
        .order("product_name"),
      supabase
        .from("product_name_aliases")
        .select("id, alias, product_sticker_id, status, is_primary, source, note, reviewed_at")
        .eq("supplier_id", sup?.id ?? "00000000-0000-0000-0000-000000000000"),
      supabase.from("vv_variant_blocks").select("sig, product_sticker_id, note"),
      supabase.from("alias_events").select("id, at, product_sticker_id, alias, sig, action, note").order("at", { ascending: false }).limit(300),
    ]);
    if (p.error || a.error) {
      setError((p.error || a.error)?.message ?? "load_failed");
      setLoading(false);
      return;
    }
    const al = (a.data ?? []) as Alias[];
    const cores = Array.from(new Set(al.map((x) => x.alias.trim().toLowerCase())));
    let vv: Variant[] = [];
    for (let i = 0; i < cores.length; i += 80) {
      const { data } = await supabase
        .from("vv_catalog")
        .select("sig, product, core, color, quality, grower, photo, order_per, price, stock, last_seen, last_in_stock_at")
        .in("core", cores.slice(i, i + 80));
      vv = vv.concat((data ?? []) as Variant[]);
    }
    setProducts((p.data ?? []) as Product[]);
    setAliases(al);
    setVariants(vv);
    setBlocks((b.data ?? []) as Block[]);
    setEvents((e.data ?? []) as Event[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load from Supabase, same as the other warehouse tabs
    load();
  }, [load]);

  const variantsByCore = useMemo(() => {
    const m = new Map<string, Variant[]>();
    for (const v of variants) {
      const list = m.get(v.core) ?? [];
      list.push(v);
      m.set(v.core, list);
    }
    for (const list of m.values())
      list.sort((x, y) => Number((y.stock ?? 0) > 0) - Number((x.stock ?? 0) > 0) || (x.price ?? 1e9) - (y.price ?? 1e9));
    return m;
  }, [variants]);

  const blocked = useMemo(() => new Set(blocks.map((b) => `${b.product_sticker_id}#${b.sig}`)), [blocks]);

  // одно и то же название Van Vliet у двух наших товаров (кроме отклонённых)
  const conflictCores = useMemo(() => {
    const owners = new Map<string, Set<string>>();
    for (const a of aliases) {
      if (a.status === "rejected") continue;
      const k = a.alias.trim().toLowerCase();
      const s = owners.get(k) ?? new Set<string>();
      s.add(a.product_sticker_id);
      owners.set(k, s);
    }
    return new Set(Array.from(owners.entries()).filter(([, s]) => s.size > 1).map(([k]) => k));
  }, [aliases]);

  const nameOf = useMemo(() => new Map(products.map((p) => [p.id, decodeHtmlEntities(p.product_name)])), [products]);

  function info(p: Product) {
    const list = aliases.filter((a) => a.product_sticker_id === p.id);
    const live = list.filter((a) => a.status !== "rejected");
    const primary = list.find((a) => a.is_primary && a.status === "approved");
    const ok = (v: Variant) => !blocked.has(`${p.id}#${v.sig}`) && (v.price ?? 0) > 0;
    const pool = (primary ? [primary] : live.filter((a) => a.status === "approved"))
      .flatMap((a) => variantsByCore.get(a.alias.trim().toLowerCase()) ?? [])
      .filter(ok);
    const inStock = pool.filter((v) => (v.stock ?? 0) > 0);
    const basis = (inStock.length ? inStock : pool).map((v) => v.price as number);
    const stem = basis.length ? Math.min(...basis) : null;
    const units = p.order_unit_size || 1;
    const cost = stem != null ? stem * DPH * units : null;
    return {
      list,
      primary,
      stem,
      stemIsOld: !inStock.length && pool.length > 0,
      cost,
      margin: cost != null && p.price ? p.price - cost : null,
      review: list.some(needsReview),
      conflict: live.some((a) => conflictCores.has(a.alias.trim().toLowerCase())),
      noLink: !list.some((a) => a.status === "approved"),
      noPrimary: !primary,
    };
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .map((p) => ({ p, i: info(p) }))
      .filter(({ p, i }) => {
        if (q && !decodeHtmlEntities(p.product_name).toLowerCase().includes(q) && !i.list.some((a) => a.alias.toLowerCase().includes(q))) return false;
        if (filter === "review") return i.review;
        if (filter === "noprimary") return !i.noLink && i.noPrimary;
        if (filter === "conflict") return i.conflict;
        if (filter === "nolink") return i.noLink;
        return true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, aliases, variantsByCore, blocked, conflictCores, filter, query]);

  const counts = useMemo(() => {
    const all = products.map((p) => info(p));
    return {
      review: all.filter((i) => i.review).length,
      noprimary: all.filter((i) => !i.noLink && i.noPrimary).length,
      conflict: all.filter((i) => i.conflict).length,
      nolink: all.filter((i) => i.noLink).length,
      all: products.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, aliases, variantsByCore, blocked, conflictCores]);

  async function rpc(key: string, fn: string, args: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    const { error: err } = await createClient().rpc(fn, args);
    if (err) setError(err.message);
    await load();
    setBusy(null);
  }
  async function scanNow() {
    setBusy("scan");
    setError(null);
    const { data, error: fnErr } = await createClient().functions.invoke("vanvliet-stock-scan", { body: {} });
    if (fnErr || data?.ok === false) setError(fnErr?.message ?? "Сканер Van Vliet не ответил");
    await load();
    setBusy(null);
  }
  function review(a: Alias, action: string) {
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt(`Почему «${a.alias}» — не ${nameOf.get(a.product_sticker_id)}? (можно пусто)`, "");
      if (note === null) return;
    }
    rpc(a.id + action, "alias_review", { p_alias_id: a.id, p_action: action, p_note: note || null });
  }
  function toggleBlock(p: Product, v: Variant, isBlocked: boolean) {
    let note: string | null = null;
    if (!isBlocked) {
      note = window.prompt("Почему этот вариант не подходит? (короче, хуже качество, другой производитель…)", "");
      if (note === null) return;
    }
    rpc(v.sig, "vv_variant_block", { p_sig: v.sig, p_product: p.id, p_blocked: !isBlocked, p_note: note || null });
  }

  if (profile && profile.role !== "manager") return <p className="p-6 text-sm text-zinc-500">Только для менеджера.</p>;
  if (loading) return <p className="p-6 text-sm text-zinc-500">Загружаю соответствия…</p>;

  const catalogEmpty = variants.length === 0;
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "review", label: "Проверить" },
    { key: "noprimary", label: "Без основного" },
    { key: "conflict", label: "Конфликты" },
    { key: "nolink", label: "Без связи" },
    { key: "all", label: "Все" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Соответствия Van Vliet</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Проверь по фото, что под названием поставщика тот самый цветок. Наличие на сайте и себестоимость считаются только по
            проверенным связям; себестоимость = цена стебля × 1,21 (DPH) × штук в охапке.
          </p>
        </div>
        <div className="flex gap-2">
        <button
          onClick={scanNow}
          disabled={busy !== null}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-50 dark:border-zinc-700"
        >
          {busy === "scan" ? "Читаю каталог…" : "↻ Обновить каталог VV"}
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: наш товар или название VV"
          className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              filter === f.key ? "bg-accent text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {f.label} <span className="opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {catalogEmpty && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Каталог Van Vliet ещё пустой — фото и цены появятся после первого запуска нового сканера (по расписанию в 6, 8, 10 и 17 ч).
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      {rows.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">Здесь всё проверено 👌</p>}

      {rows.map(({ p, i }) => {
        const name = decodeHtmlEntities(p.product_name);
        const pEvents = events.filter((e) => e.product_sticker_id === p.id).slice(0, 6);
        const sorted = i.list.slice().sort((x, y) => {
          const r = (a: Alias) => (a.is_primary ? 0 : a.status === "approved" ? 1 : a.status === "suggested" ? 2 : 3);
          return r(x) - r(y);
        });
        return (
          <section key={p.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex w-full gap-3 sm:w-64 sm:flex-col">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={name} className="h-28 w-24 rounded-lg bg-zinc-100 object-cover sm:h-40 sm:w-full dark:bg-zinc-800" />
                ) : (
                  <div className="flex h-28 w-24 items-center justify-center rounded-lg bg-zinc-100 text-3xl sm:h-40 sm:w-full dark:bg-zinc-800">🌸</div>
                )}
                <div className="text-sm">
                  <p className="font-semibold">{name}</p>
                  <p className="text-zinc-500">
                    {p.order_unit_size ?? 1} шт · на сайте {p.price ? kc(p.price) : "—"}
                  </p>
                  {i.cost != null ? (
                    <p className="mt-1">
                      Себестоимость <b>{kc(i.cost)}</b>
                      {i.margin != null && p.price ? (
                        <>
                          {" "}
                          · маржа{" "}
                          <b className={i.margin / p.price < 0.45 ? "text-red-600" : "text-green-600"}>
                            {kc(i.margin)} ({Math.round((i.margin / p.price) * 100)} %)
                          </b>
                        </>
                      ) : null}
                      <span className="block text-xs text-zinc-500">
                        стебель {i.stem} Kč без DPH{i.primary ? " · по основному сорту" : " · самый дешёвый из связей"}
                        {i.stemIsOld ? " · последняя известная цена" : ""}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">Себестоимость неизвестна — нет проверенной связи с ценой.</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    {i.noLink && <span className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-700">нет связи</span>}
                    {!i.noLink && i.noPrimary && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">нет основного</span>}
                    {i.conflict && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-500/20 dark:text-red-300">конфликт</span>}
                  </div>
                  <button
                    onClick={() => setLinkFor(p)}
                    className="mt-2 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent dark:border-zinc-600"
                  >
                    + Привязать сорт из каталога
                  </button>
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                {sorted.length === 0 && <p className="text-sm text-zinc-500">Связей нет. Нажми «Привязать сорт из каталога».</p>}
                {sorted.map((a) => {
                  const core = a.alias.trim().toLowerCase();
                  const vs = variantsByCore.get(core) ?? [];
                  const others = aliases.filter((x) => x.status !== "rejected" && x.product_sticker_id !== p.id && x.alias.trim().toLowerCase() === core);
                  const badge =
                    a.status === "rejected"
                      ? ["✗ не он", "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"]
                      : a.is_primary
                        ? ["⭐ основной", "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"]
                        : a.status === "approved" && a.reviewed_at
                          ? ["✓ проверено", "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"]
                          : a.status === "approved"
                            ? ["старая связь · проверь по фото", "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"]
                            : ["🟡 предложено", "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200"];
                  return (
                    <div key={a.id} className={`rounded-xl border p-3 ${a.status === "rejected" ? "border-zinc-200 opacity-60 dark:border-zinc-800" : "border-zinc-200 dark:border-zinc-700"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium">{a.alias}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge[1]}`}>{badge[0]}</span>
                        {a.source === "ai" && <span className="text-[11px] text-zinc-500">предложил ИИ</span>}
                        {a.note && <span className="text-[11px] text-zinc-500">«{a.note}»</span>}
                        {others.length > 0 && (
                          <span className="text-[11px] text-red-600">тоже связано с: {others.map((o) => nameOf.get(o.product_sticker_id)).join(", ")}</span>
                        )}
                        <div className="ml-auto flex flex-wrap gap-1">
                          {a.status !== "approved" || !a.reviewed_at ? (
                            <button disabled={busy !== null} onClick={() => review(a, "approve")} className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                              ✓ Это он
                            </button>
                          ) : null}
                          {a.status !== "rejected" &&
                            (a.is_primary ? (
                              <button disabled={busy !== null} onClick={() => review(a, "unprimary")} className="rounded-md border border-amber-400 px-2 py-1 text-xs font-medium text-amber-700 disabled:opacity-50 dark:text-amber-300">
                                Снять основной
                              </button>
                            ) : (
                              <button disabled={busy !== null} onClick={() => review(a, "primary")} className="rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                                ⭐ Основной
                              </button>
                            ))}
                          {a.status !== "rejected" ? (
                            <button disabled={busy !== null} onClick={() => review(a, "reject")} className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 disabled:opacity-50 dark:border-red-500/40">
                              ✗ Не он
                            </button>
                          ) : (
                            <button disabled={busy !== null} onClick={() => review(a, "approve")} className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-600">
                              Вернуть
                            </button>
                          )}
                        </div>
                      </div>
                      {a.status !== "rejected" && (
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {vs.length === 0 && (
                            <p className="col-span-full text-xs text-zinc-500">
                              {catalogEmpty ? "Фото появятся после первого скана." : "Этого сорта сейчас нет в каталоге Van Vliet."}
                            </p>
                          )}
                          {vs.slice(0, 8).map((v) => {
                            const isBlocked = blocked.has(`${p.id}#${v.sig}`);
                            const has = (v.stock ?? 0) > 0;
                            return (
                              <div key={v.sig} className={`rounded-lg border p-1.5 text-[11px] ${isBlocked ? "border-red-300 bg-red-50/60 opacity-70 dark:border-red-500/40 dark:bg-red-500/10" : "border-zinc-200 dark:border-zinc-700"}`}>
                                <button onClick={() => setZoom(v)} className="block w-full">
                                  {v.photo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.photo} alt={v.product} loading="lazy" className="h-28 w-full rounded bg-zinc-100 object-contain dark:bg-zinc-800" />
                                  ) : (
                                    <div className="flex h-28 items-center justify-center rounded bg-zinc-100 text-zinc-400 dark:bg-zinc-800">нет фото</div>
                                  )}
                                </button>
                                <p className="mt-1 font-medium leading-tight">{v.product}</p>
                                <p className="text-zinc-500">
                                  {[v.color, v.quality, v.grower].filter(Boolean).join(" · ")}
                                </p>
                                <p>
                                  {v.price != null ? <b>{v.price} Kč/шт</b> : "—"}
                                  {v.order_per ? <span className="text-zinc-500"> · по {v.order_per}</span> : null}
                                </p>
                                <p className={has ? "text-green-600" : "text-zinc-500"}>
                                  {has ? `есть ${v.stock}` : v.last_in_stock_at ? `был ${formatDateTime(v.last_in_stock_at)}` : "нет в наличии"}
                                </p>
                                <button
                                  disabled={busy !== null}
                                  onClick={() => toggleBlock(p, v, isBlocked)}
                                  className={`mt-1 w-full rounded px-1 py-0.5 font-medium disabled:opacity-50 ${isBlocked ? "bg-zinc-200 dark:bg-zinc-700" : "border border-red-200 text-red-600 dark:border-red-500/40"}`}
                                >
                                  {isBlocked ? "Снова подходит" : "Этот вариант не подходит"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {pEvents.length > 0 && (
                  <details className="text-xs text-zinc-500">
                    <summary className="cursor-pointer">Журнал ({pEvents.length})</summary>
                    <ul className="mt-1 space-y-0.5">
                      {pEvents.map((e) => (
                        <li key={e.id}>
                          {formatDateTime(e.at)} — {ACTION_LABEL[e.action] ?? e.action} {e.alias ?? e.sig?.split("|")[0] ?? ""}
                          {e.note ? ` «${e.note}»` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setZoom(null)}>
          <div className="max-h-full max-w-lg overflow-auto rounded-2xl bg-white p-3 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            {zoom.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={zoom.photo} alt={zoom.product} className="max-h-[70vh] w-full rounded-lg object-contain" />
            )}
            <p className="mt-2 font-medium">{zoom.product}</p>
            <p className="text-sm text-zinc-500">{[zoom.color, zoom.quality, zoom.grower].filter(Boolean).join(" · ")}</p>
            <p className="text-sm">
              {zoom.price != null ? `${zoom.price} Kč/шт без DPH (${(zoom.price * DPH).toFixed(1)} с DPH)` : ""}
              {zoom.order_per ? ` · по ${zoom.order_per} шт` : ""}
            </p>
            <button onClick={() => setZoom(null)} className="mt-2 w-full rounded-lg bg-zinc-100 py-2 text-sm dark:bg-zinc-800">
              Закрыть
            </button>
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
      const { data } = await createClient()
        .from("vv_catalog")
        .select("sig, product, core, color, quality, grower, photo, order_per, price, stock, last_seen, last_in_stock_at")
        .ilike("product", `%${s}%`)
        .order("stock", { ascending: false })
        .limit(40);
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
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">Привязать к «{name}»</p>
        <p className="text-xs text-zinc-500">Ищи по названию Van Vliet: rosa, eust, paeonia, calla…</p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Название у Van Vliet"
          className="mt-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-3 grid flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
          {found.map((v) => (
            <button key={v.sig} disabled={busy} onClick={() => link(v)} className="rounded-lg border border-zinc-200 p-1.5 text-left text-[11px] hover:border-accent disabled:opacity-50 dark:border-zinc-700">
              {v.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.photo} alt={v.product} loading="lazy" className="h-24 w-full rounded bg-zinc-100 object-contain dark:bg-zinc-800" />
              ) : (
                <div className="h-24 rounded bg-zinc-100 dark:bg-zinc-800" />
              )}
              <p className="mt-1 font-medium leading-tight">{v.product}</p>
              <p className="text-zinc-500">{[v.color, v.quality, v.grower].filter(Boolean).join(" · ")}</p>
              <p>
                {v.price != null ? `${v.price} Kč/шт` : "—"} · {(v.stock ?? 0) > 0 ? `есть ${v.stock}` : "нет"}
              </p>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-3 rounded-lg bg-zinc-100 py-2 text-sm dark:bg-zinc-800">
          Закрыть
        </button>
      </div>
    </div>
  );
}
