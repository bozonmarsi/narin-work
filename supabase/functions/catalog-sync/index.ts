// catalog-sync — kazdou hodinu stahne ceny z katalogu Tilda a ulozi je do
// catalog_prices (apply_catalog_snapshot), odkud je cte checkout-order a
// ktere zaroven aktualizuji product_stickers.price/order_unit_size pro sklad.
//
// Volá pg_cron (migrace 20261019000000) s hlavickou
//   Authorization: Bearer <CATALOG_SYNC_SECRET>
// Tajny klic je v Supabase Vault ('catalog_sync_secret') a ve stejne hodnote
// v promenne prostredi funkce CATALOG_SYNC_SECRET. Funkce se nasazuje s
// vypnutou kontrolou JWT (verify_jwt = false) - overuje si klic sama.
//
// Kdyz Tilda neodpovi (ochrana proti botum, vypadek), funkce to zapise do
// catalog_sync_log; po 3 neuspesnych bězich za sebou prijde Telegram.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CATALOG_URL =
  "https://store.tildaapi.one/api/getproductslist/?storepartuid=388736252314&recid=1&c=1&getparts=true&getoptions=true&slice=1&size=500";

export type CatalogRow = { uid: string; title: string; price: number; portion: number };

const NAMED: Record<string, string> = {
  aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó",
  uacute: "ú", Uacute: "Ú", yacute: "ý", Yacute: "Ý", scaron: "š", Scaron: "Š", ccaron: "č", Ccaron: "Č",
  rcaron: "ř", Rcaron: "Ř", zcaron: "ž", Zcaron: "Ž", ecaron: "ě", Ecaron: "Ě", ncaron: "ň", dcaron: "ď",
  tcaron: "ť", uring: "ů", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
};

export function decodeEntities(s: string): string {
  return String(s || "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([A-Za-z]+);/g, (m, n) => NAMED[n] ?? m)
    .trim();
}

export function parseCatalog(data: any): CatalogRow[] {
  const out: CatalogRow[] = [];
  for (const p of data?.products || []) {
    const price = Number(p.price);
    if (!(price > 0)) continue;
    const title = decodeEntities(p.title);
    if (!title) continue;
    out.push({ uid: String(p.uid), title, price, portion: Math.max(0, Math.round(Number(p.portion) || 0)) });
  }
  return out;
}

export async function fetchCatalog(fetchFn: typeof fetch = fetch): Promise<CatalogRow[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let res: Response;
  try {
    res = await fetchFn(CATALOG_URL, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`tilda_http_${res.status}`);
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error("tilda_not_json"); // napr. stranka ochrany proti botum
  }
  const rows = parseCatalog(data);
  if (rows.length < 30) throw new Error(`tilda_too_few_items_${rows.length}`);
  return rows;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function run(supabase: any, fetchFn: typeof fetch = fetch) {
  let rows: CatalogRow[];
  try {
    rows = await fetchCatalog(fetchFn);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await supabase.rpc("record_catalog_sync", { p_ok: false, p_items: 0, p_error: msg });
    return { status: 502, body: { ok: false, error: msg } };
  }
  const { data, error } = await supabase.rpc("apply_catalog_snapshot", { p_items: rows });
  if (error) {
    await supabase.rpc("record_catalog_sync", { p_ok: false, p_items: rows.length, p_error: error.message });
    return { status: 500, body: { ok: false, error: error.message } };
  }
  await supabase.rpc("record_catalog_sync", { p_ok: true, p_items: rows.length, p_error: null, p_summary: data });
  return { status: 200, body: { ok: true, ...data } };
}

if (Deno.env.get("CATALOG_SYNC_TEST") !== "1") {
  Deno.serve(async (req) => {
    const secret = Deno.env.get("CATALOG_SYNC_SECRET") || "";
    if (!secret) return new Response(JSON.stringify({ ok: false, error: "not_configured" }), { status: 500 });
    const auth = req.headers.get("authorization") || "";
    if (!safeEqual(auth, `Bearer ${secret}`)) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const r = await run(supabase);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  });
}
