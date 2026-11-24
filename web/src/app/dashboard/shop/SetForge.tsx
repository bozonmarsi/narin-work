"use client";

// Магазин -> Кузница сетов. Владелец загружает прайс Голландии Van Vliet
// (Excel), Claude по нему придумывает сеты из 2-4 охапок (edge-функция
// set-forge), владелец жмёт "Взять" (создаётся сет в Каталоге с составом
// из Van Vliet) или "Нет" с причиной - решения учат следующий подбор.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Pricelist = { id: string; uploaded_at: string; file_name: string | null; arrival_date: string | null; row_count: number };
type ForgeItem = {
  catalog_name: string;
  common_ru: string;
  label_cs: string;
  role: "akcent" | "objem" | "faktura";
  qty: number;
  pack: number;
  color: string | null;
  length_cm: number | null;
  origin: string | null;
  price: number | null;
  cost: number;
};
type Candidate = {
  id: string;
  pricelist_id: string | null;
  created_at: string;
  status: "pending" | "taken" | "rejected";
  name: string;
  description_cs: string | null;
  idea_ru: string | null;
  items: ForgeItem[];
  stems: number | null;
  cost: number | null;
  reject_note: string | null;
  set_id: string | null;
};
type VvPhoto = { key: string; photo: string };

const ROLE: Record<string, string> = { akcent: "акцент", objem: "объём", faktura: "фактура" };

// Цвет из прайса -> кружок, когда фото сорта у нас ещё нет.
const SWATCH: Record<string, string> = {
  white: "#f4f4f0", offwhite: "#efeadf", creme: "#f3e6c4", ivory: "#f1ead2", champagne: "#ead9b8",
  yellow: "#f2d43a", gold: "#d9b33c", orange: "#ee8a2e", apricot: "#f3b27a", peach: "#f6b994", salmon: "#f39b85",
  terracotta: "#c8643f", copper: "#b86b3c", bronze: "#9b6a3a", brown: "#7a4b2a",
  pink: "#ef8fb4", "pink pale": "#f7cfdc", "pink light": "#f5c1d3", "pink dark": "#d24f86", cerise: "#d11f6b",
  red: "#c8202e", "red dark": "#8e1424", bordeaux: "#6d1530", black: "#2a1f26",
  purple: "#7b3fa0", "purple dark": "#4c1f63", lilac: "#c3a3d8", lavender: "#b6a3e0", milka: "#b48fcf",
  blue: "#3e63c9", "blue light": "#8fb0e8", "blue dark": "#1f3a8a", green: "#6aa84f", silver: "#c9cdd2",
};
function swatch(color: string | null) {
  const c = (color ?? "").toLowerCase().split("+")[0].trim();
  return SWATCH[c] ?? "#d4d4d8";
}

// Названия как в каталоге Van Vliet: пражский прайс обрезает их (~25 символов),
// поэтому сравниваем по началу строки без длины/веса/упаковки.
function nameKey(s: string) {
  return s
    .toLowerCase()
    .replace(/\(\s*imp\s*\)/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*(cm|gram)\b/g, " ")
    .replace(/\b\d+-\d+\s*gram\b/g, " ")
    .replace(/\b\d+\s*st\b/g, " ")
    .replace(/\bx\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function findPhoto(name: string, photos: VvPhoto[]) {
  const k = nameKey(name);
  let best: VvPhoto | null = null;
  for (const p of photos) {
    if (p.key === k) return p.photo;
    const short = p.key.length < k.length ? p.key : k;
    if (short.length >= 12 && (k.startsWith(p.key) || p.key.startsWith(k))) {
      if (!best || p.key.length > best.key.length) best = p;
    }
  }
  return best?.photo ?? null;
}

function fmtDate(d: string | null) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${Number(day)}. ${Number(m)}. ${y}`;
}

function composeText(c: Candidate) {
  const lines = c.items.map((it, i) => `${String(i + 1).padStart(2, "0")} / ${it.label_cs}`);
  return [
    `OBSAH: SADA ${c.items.length} SAMOSTATNÝCH NÁRUČÍ.`,
    "",
    "SLOŽENÍ:",
    ...lines,
    "====================",
    `POPIS: ${(c.description_cs ?? "").toUpperCase()}`,
  ].join("\n");
}

async function fileToBase64(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function SetForge() {
  const [pricelists, setPricelists] = useState<Pricelist[]>([]);
  const [plId, setPlId] = useState<string>("");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [photos, setPhotos] = useState<VvPhoto[]>([]);
  const [tab, setTab] = useState<"pending" | "taken" | "rejected">("pending");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<"" | "upload" | "forge">("");
  const [msg, setMsg] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: pls }, { data: cs }] = await Promise.all([
      supabase.from("forge_pricelists").select("id, uploaded_at, file_name, arrival_date, row_count").order("uploaded_at", { ascending: false }).limit(10),
      supabase.from("forge_candidates").select("*").order("created_at", { ascending: false }).limit(300),
    ]);
    setPricelists(pls ?? []);
    setPlId((cur) => cur || pls?.[0]?.id || "");
    setCands((cs ?? []) as Candidate[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    createClient()
      .from("vv_catalog")
      .select("product, photo")
      .not("photo", "is", null)
      .then(({ data }) => setPhotos((data ?? []).map((r) => ({ key: nameKey(r.product), photo: r.photo as string }))));
  }, [load]);

  const shown = useMemo(() => cands.filter((c) => c.status === tab), [cands, tab]);
  const counts = useMemo(() => {
    const n = { pending: 0, taken: 0, rejected: 0 };
    for (const c of cands) n[c.status]++;
    return n;
  }, [cands]);
  const current = pricelists.find((p) => p.id === plId);

  async function upload(file: File) {
    setBusy("upload");
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("set-forge", {
      body: { action: "import", file_name: file.name, file_b64: await fileToBase64(file) },
    });
    setBusy("");
    if (error || !data?.ok) {
      setMsg(data?.error === "empty_pricelist" ? "В файле нет ни одного цветка — выгрузи прайс ещё раз без фильтров." : "Не получилось загрузить прайс.");
      return;
    }
    setPlId(data.pricelist.id);
    setMsg(`Прайс загружен: ${data.pricelist.row_count} сортов.`);
    load();
  }

  async function forge() {
    if (!plId) return;
    setBusy("forge");
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("set-forge", {
      body: { action: "generate", pricelist_id: plId, count: 6, hint },
    });
    setBusy("");
    if (error || !data?.ok) {
      setMsg("Не получилось выковать сеты — попробуй ещё раз.");
      return;
    }
    setMsg(data.created ? `Готово: ${data.created} новых сетов.` : "Ничего подходящего не вышло — попробуй ещё раз или другое пожелание.");
    setTab("pending");
    load();
  }

  async function take(c: Candidate) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const setId = crypto.randomUUID();
    setCands((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "taken", set_id: setId } : x)));
    const { error } = await supabase.from("product_stickers").insert({ id: setId, product_name: c.name, image_url: "", category: "set" });
    if (error) {
      setMsg(`Сет не создан: ${error.message}`);
      load();
      return;
    }
    await supabase
      .from("product_recipes")
      .insert(c.items.map((it) => ({ bouquet_sticker_id: setId, vanvliet_ingredient_name: it.catalog_name, quantity_needed: it.qty })));
    await supabase
      .from("forge_candidates")
      .update({ status: "taken", set_id: setId, decided_at: new Date().toISOString(), decided_by: user?.id ?? null })
      .eq("id", c.id);
    setMsg(`«${c.name}» добавлен в Каталог → Сеты. Осталось фото и цена.`);
  }

  async function reject(c: Candidate) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const note = rejectNote.trim() || null;
    setCands((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "rejected", reject_note: note } : x)));
    setRejecting(null);
    setRejectNote("");
    await supabase
      .from("forge_candidates")
      .update({ status: "rejected", reject_note: note, decided_at: new Date().toISOString(), decided_by: user?.id ?? null })
      .eq("id", c.id);
  }

  async function backToPending(c: Candidate) {
    setCands((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "pending", reject_note: null } : x)));
    await createClient().from("forge_candidates").update({ status: "pending", reject_note: null, decided_at: null }).eq("id", c.id);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1200);
  }

  const btn = "rounded-full px-3 py-1.5 text-sm font-medium";
  const ghost = "border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800";

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${btn} ${ghost} cursor-pointer`}>
            {busy === "upload" ? "Загружаю…" : "📄 Загрузить прайс Голландии"}
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }}
            />
          </label>
          {pricelists.length > 0 && (
            <select
              value={plId}
              onChange={(e) => setPlId(e.target.value)}
              className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1.5 text-sm"
            >
              {pricelists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.arrival_date ? `Приход ${fmtDate(p.arrival_date)}` : p.file_name} · {p.row_count} сортов
                </option>
              ))}
            </select>
          )}
        </div>
        {current ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Пожелание (необязательно): зимние, красно-белые, без роз…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-1.5 text-sm"
            />
            <button onClick={forge} disabled={!!busy} className={`${btn} bg-accent text-white disabled:opacity-50`}>
              {busy === "forge" ? "Кую… ~1 мин" : "🔨 Выковать 6 сетов"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Загрузи Excel из Van Vliet (Голландия, Pricelists_….xlsx) — по нему будут собираться сеты.</p>
        )}
        {msg && <p className="text-sm text-zinc-600 dark:text-zinc-300">{msg}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["pending", "taken", "rejected"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`${btn} ${tab === t ? "bg-accent text-white" : ghost}`}>
            {t === "pending" ? "Новые" : t === "taken" ? "Взятые" : "Отклонённые"} {counts[t] > 0 && <span className="opacity-70">{counts[t]}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="text-sm text-zinc-500">
          {tab === "pending" ? (current ? "Нажми «Выковать» — появятся новые сеты." : "Сначала загрузи прайс.") : "Пока пусто."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => (
          <div key={c.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold">{c.name}</h3>
              <span className="shrink-0 text-sm text-zinc-500">
                {c.stems} шт · <b className="text-zinc-800 dark:text-zinc-100">{c.cost} Kč</b>
              </span>
            </div>
            {c.idea_ru && <p className="text-xs text-zinc-500">{c.idea_ru}</p>}

            <ul className="space-y-1.5">
              {c.items.map((it, i) => {
                const photo = findPhoto(it.catalog_name, photos);
                const key = `${c.id}-${i}`;
                return (
                  <li key={key} className="flex items-center gap-2">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="h-11 w-11 shrink-0 rounded-lg ring-1 ring-black/10" style={{ background: swatch(it.color) }} title={it.color ?? ""} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-tight">
                        {it.common_ru} <span className="text-xs text-zinc-400">· {ROLE[it.role] ?? it.role}</span>
                      </div>
                      <button
                        onClick={() => copy(it.catalog_name, key)}
                        title="Скопировать название для поиска в каталоге Van Vliet"
                        className="max-w-full truncate text-left font-mono text-[11px] text-zinc-500 hover:text-accent"
                      >
                        {copied === key ? "✓ скопировано" : `⧉ ${it.catalog_name}`}
                      </button>
                    </div>
                    <div className="shrink-0 text-right text-xs text-zinc-500">
                      <div>
                        {it.qty} шт{it.length_cm ? ` · ${it.length_cm} см` : ""}
                      </div>
                      <div>{it.cost} Kč</div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <button onClick={() => setOpen(open === c.id ? null : c.id)} className="text-xs text-zinc-500 hover:text-accent">
              {open === c.id ? "▴ текст для сайта" : "▾ текст для сайта"}
            </button>
            {open === c.id && (
              <div className="space-y-1">
                <pre className="whitespace-pre-wrap rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-2 text-[11px] leading-snug">{composeText(c)}</pre>
                <button onClick={() => copy(composeText(c), `${c.id}-text`)} className="text-xs text-accent">
                  {copied === `${c.id}-text` ? "✓ скопировано" : "⧉ скопировать"}
                </button>
              </div>
            )}

            {c.status === "pending" &&
              (rejecting === c.id ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && reject(c)}
                    placeholder="Почему нет? (цвета, дорого, скучно…)"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm"
                  />
                  <button onClick={() => reject(c)} className={`${btn} ${ghost}`}>
                    OK
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button onClick={() => take(c)} className={`${btn} flex-1 bg-accent text-white`}>
                    ✓ Взять
                  </button>
                  <button onClick={() => setRejecting(c.id)} className={`${btn} ${ghost}`}>
                    ✗ Нет
                  </button>
                </div>
              ))}
            {c.status === "rejected" && (
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span>{c.reject_note ? `Причина: ${c.reject_note}` : "Отклонён"}</span>
                <button onClick={() => backToPending(c)} className="hover:text-accent">
                  вернуть
                </button>
              </div>
            )}
            {c.status === "taken" && <p className="text-xs text-emerald-600">✓ В Каталоге → Сеты</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
