// checkout-order — oplata objednavky depozitem (cely nebo cast + zbytek kartou)
// a uplatneni libovolneho poctu bodu (1 az 30 % zbozi).
//
// Pouziva stranka /payment, kdyz si zakaznik zvoli "Zaplatit z depozitu" nebo uplatni body.
// Ostatni objednavky jdou dal pres formular Tilda jako dosud.
//
// Co funkce dela (nic z toho nebere ze stranky na slovo):
//   * cenu zbozi pocita z verejneho katalogu Tilda (cena + velikost baleni),
//   * dopravu z funkce expected_delivery_fee (vzdalenost od skladu),
//   * zustatek depozitu cte z DB podle e-mailu v podepsanem tokenu.
//
// Akce (POST JSON):
//   { action: "quote",  token, products:[{uid, quantity}], delivery:"courier"|"pickup",
//     form:{ recipient_lat, recipient_lng, psc }, use_deposit:true }
//     -> { goods, delivery, total, balance, deposit, card }
//   { action: "points", token, products, use_points }      -> { goods, balance, cap }  (jen kontrola)
//   Body: use_points:N + use_deposit:false (body a depozit se nekombinuji); nejvic min(zustatek, 30 % zbozi).
//   Hotove: pay:"cash" jen pri osobnim odberu (u body).
//   { action: "create", token, checkout_key, products, delivery, form:{...pole objednavky},
//     use_deposit:true }
//     -> { order_id, paid:true, url }          (cely depozitem)
//        { order_id, paid:false, url:<Stripe> } (zbytek kartou)
//
// Odpis depozitu a stav "Oplaceno" resi SQL funkce settle_order_payment.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://vezminarin.cz";
const SUCCESS_URL = `${SITE}/payment-successful`;
const CANCEL_URL = `${SITE}/payment-failed`;
const CATALOG_URL =
  "https://store.tildaapi.one/api/getproductslist/?storepartuid=388736252314&recid=1&c=1&getparts=true&getoptions=true&slice=1&size=500";
const PICKUP_FEE = 80;
const CASH_URL = `${SITE}/objednavka-hotovost`;
const POINTS_SHARE = 0.3; // body lze uplatnit az na 30 % hodnoty zbozi

const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
class Fail extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

// --- token (stejny HMAC jako ve zbytku projektu) ---------------------------
async function verifyToken(token: string, secret: string): Promise<string | null> {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  if (expected !== sigB64) return null;
  try {
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return String(payload.email || "").trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

const NAMED: Record<string, string> = {
  aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó",
  uacute: "ú", Uacute: "Ú", yacute: "ý", Yacute: "Ý", scaron: "š", Scaron: "Š", ccaron: "č", Ccaron: "Č",
  rcaron: "ř", Rcaron: "Ř", zcaron: "ž", Zcaron: "Ž", ecaron: "ě", Ecaron: "Ě", ncaron: "ň", dcaron: "ď",
  tcaron: "ť", uring: "ů", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
};
// stejna dekodovani HTML entit jako v catalog-sync (nazvy v catalog_prices jsou dekodovane)
function decodeEntities(s: string): string {
  return String(s || "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([A-Za-z]+);/g, (m, n) => NAMED[n] ?? m)
    .trim();
}

// --- katalog Tilda (cache 10 min, zaloha v tabulce catalog_prices) ----------
type CatalogItem = { uid: string; title: string; price: number; portion: number };
let catalogCache: { at: number; items: Map<string, CatalogItem> } | null = null;

// 1) zivy katalog Tilda (pri uspechu obnovi i kopii v DB),
// 2) pri chybe (Tilda blokuje server, vypadek) kopie z tabulky catalog_prices.
// Produkt, ktery neni v katalogu, se odmita vzdy - cena ze stranky se nikdy nepouzije.
export async function loadCatalog(supabase: any): Promise<Map<string, CatalogItem>> {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60 * 1000) return catalogCache.items;

  // Rychla cesta: kopie v tabulce catalog_prices, kterou kazdou hodinu obnovuje catalog-sync
  // (stejny zdroj cen jako pro sklad). Cteni z DB trva desitky ms, zivy katalog Tilda vic vterin.
  // Zivy katalog se pouzije jen kdyz je kopie starsi nez 70 minut.
  try {
    const { data: mirror } = await supabase
      .from("catalog_prices")
      .select("uid, title, price, portion, seen_at")
      .eq("active", true);
    if (mirror && mirror.length >= 10) {
      const newest = Math.max(...mirror.map((r: any) => new Date(r.seen_at).getTime() || 0));
      if (Date.now() - newest < 70 * 60 * 1000) {
        const fast = new Map<string, CatalogItem>();
        for (const r of mirror) {
          fast.set(String(r.uid), { uid: String(r.uid), title: String(r.title), price: Number(r.price), portion: Number(r.portion) || 0 });
        }
        catalogCache = { at: Date.now(), items: fast };
        return fast;
      }
    }
  } catch (e) {
    console.warn("catalog mirror fast path failed", String(e));
  }

  let items = new Map<string, CatalogItem>();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(CATALOG_URL, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      for (const p of data.products || []) {
        const price = Number(p.price);
        if (!(price > 0)) continue;
        items.set(String(p.uid), {
          uid: String(p.uid),
          title: decodeEntities(p.title),
          price,
          portion: Math.max(0, Number(p.portion) || 0),
        });
      }
    } else {
      console.warn("tilda catalog http", res.status);
    }
  } catch (e) {
    console.warn("tilda catalog fetch failed", String(e));
  }

  if (items.size >= 10) {
    // obnova kopie v DB spolecnou funkci (stejna jako v catalog-sync; ma ochrany
    // proti necele odpovedi). Nekriticke: chyba se jen zaloguje.
    try {
      const rows = [...items.values()].map((i) => ({ uid: i.uid, title: i.title, price: i.price, portion: i.portion }));
      const { error } = await supabase.rpc("apply_catalog_snapshot", { p_items: rows });
      if (error) console.warn("catalog snapshot rejected", error.message);
    } catch (e) {
      console.warn("catalog mirror update failed", String(e));
    }
  } else {
    items = new Map();
    const { data, error } = await supabase.from("catalog_prices").select("uid, title, price, portion").eq("active", true);
    if (error) console.error("catalog mirror read failed", error.message);
    for (const r of data || []) {
      items.set(String(r.uid), { uid: String(r.uid), title: String(r.title), price: Number(r.price), portion: Number(r.portion) || 0 });
    }
    if (items.size < 10) throw new Fail("catalog_unavailable", 503);
    console.warn("using catalog_prices fallback");
  }

  catalogCache = { at: Date.now(), items };
  return items;
}

// --- cena kosiku -----------------------------------------------------------
// Cena v katalogu je za balení (portion kusu); v kosiku Tilda je "quantity" pocet kusu,
// jednotkova cena = price / portion. Bez baleni (portion 0) je cena za kus.
export function priceCart(catalog: Map<string, CatalogItem>, products: Array<{ uid: unknown; quantity: unknown }>) {
  if (!Array.isArray(products) || products.length === 0) throw new Fail("empty_cart");
  if (products.length > 60) throw new Fail("cart_too_large");
  const lines: Array<{ name: string; unit: string; price: string; amount: number; portion: string; quantity: number }> = [];
  let goods = 0;
  for (const p of products) {
    const item = catalog.get(String(p.uid));
    if (!item) throw new Fail("product_unavailable:" + String(p.uid));
    if (/poukaz/i.test(item.title)) throw new Fail("voucher_not_supported");
    const quantity = Number(p.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000) throw new Fail("bad_quantity");
    if (item.portion > 0 && quantity % item.portion !== 0) throw new Fail("bad_quantity");
    const unit = item.portion > 0 ? item.price / item.portion : item.price;
    const amount = Math.round(unit * quantity * 100) / 100;
    goods += amount;
    lines.push({
      name: item.title,
      unit: "pc",
      price: String(Math.round(unit * 100) / 100),
      amount,
      portion: String(item.portion),
      quantity,
    });
  }
  return { lines, goods: Math.round(goods * 100) / 100 };
}

// --- doprava ---------------------------------------------------------------
async function deliveryFee(supabase: any, mode: string, form: Record<string, any>) {
  if (mode === "pickup") return { fee: PICKUP_FEE, km: null as number | null };
  if (mode !== "courier") throw new Fail("bad_delivery");
  const lat = parseFloat(form?.recipient_lat);
  const lng = parseFloat(form?.recipient_lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const { data, error } = await supabase.rpc("expected_delivery_fee", { p_lat: lat, p_lng: lng });
    const e = Array.isArray(data) ? data[0] : data;
    if (error || !e) throw new Fail("delivery_calc_failed", 500);
    if (e.too_far) throw new Fail("too_far");
    return { fee: Number(e.fee), km: Number(e.km) };
  }
  // jako na strance: Praha 1xxxx bez souradnic = zakladni cena, jinak vybrat adresu ze seznamu
  const psc = String(form?.psc || "").replace(/\s+/g, "");
  if (/^1\d{4}$/.test(psc)) return { fee: 159 + PICKUP_FEE, km: null };
  throw new Fail("address_not_selected");
}

// Body: cele cislo od 1 do min(zustatek bodu, 30 % zbozi). Nekombinuji se s depozitem.
async function checkPoints(supabase: any, email: string, want: number, goods: number) {
  const { data } = await supabase.from("Tilda points").select("balance").ilike("email", email).maybeSingle();
  const balance = Math.max(0, Math.floor(Number(data?.balance || 0)));
  const cap = Math.max(0, Math.min(balance, Math.floor(goods * POINTS_SHARE)));
  if (want > balance) throw new Fail("not_enough_points");
  if (want > cap) throw new Fail("points_over_limit");
  return { balance, cap };
}

export async function quote(supabase: any, email: string, body: any) {
  // katalog, cena dopravy a zustatek depozitu jsou nezavisle: bezi zaroven
  const [catalog, delivery, depRes] = await Promise.all([
    loadCatalog(supabase),
    deliveryFee(supabase, body.delivery, body.form || {}),
    supabase.from("customer_deposits").select("balance").ilike("email", email).maybeSingle(),
  ]);
  const { lines, goods } = priceCart(catalog, body.products);
  const { fee, km } = delivery;
  const total = Math.round((goods + fee) * 100) / 100;

  const wantPoints = Math.floor(Number(body.use_points) || 0);
  let points = 0;
  if (wantPoints > 0) {
    if (body.use_deposit !== false) throw new Fail("points_with_deposit");
    await checkPoints(supabase, email, wantPoints, goods);
    points = wantPoints;
  }

  const dep = depRes?.data;
  const balance = Math.max(0, Number(dep?.balance || 0));
  // cele koruny, aby Stripe castka byla cele cislo
  const deposit = body.use_deposit === false || points > 0 ? 0 : Math.floor(Math.min(balance, total));
  const card = Math.round((total - points - deposit) * 100) / 100;
  return { lines, goods, delivery: fee, km, total, balance, deposit, points, card };
}

// jen kontrola bodu (bez dopravy), aby je stranka mohla overit hned pri "Uplatnit"
async function pointsInfo(supabase: any, email: string, body: any) {
  const catalog = await loadCatalog(supabase);
  const { goods } = priceCart(catalog, body.products);
  const want = Math.floor(Number(body.use_points) || 0);
  const { balance, cap } = await checkPoints(supabase, email, Math.max(0, want), goods);
  return { goods, balance, cap };
}

// --- Stripe ----------------------------------------------------------------
async function stripe(path: string, params: URLSearchParams | null, method = "POST") {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Fail("stripe_not_configured", 500);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? params.toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("stripe error", JSON.stringify(data?.error || data));
    throw new Fail("stripe_error", 502);
  }
  return data;
}

async function createStripeSession(orderId: string, amountKc: number, email: string, hadDeposit: number) {
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", SUCCESS_URL);
  p.set("cancel_url", CANCEL_URL);
  p.set("locale", "cs");
  p.set("customer_email", email);
  p.set("client_reference_id", orderId);
  p.set("expires_at", String(Math.floor(Date.now() / 1000) + 31 * 60));
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "czk");
  p.set("line_items[0][price_data][unit_amount]", String(Math.round(amountKc * 100)));
  p.set(
    "line_items[0][price_data][product_data][name]",
    hadDeposit > 0 ? `NARIN objednávka ${orderId} (zbytek po depozitu)` : `NARIN objednávka ${orderId}`,
  );
  // rapid-processor cte metadata.invoiceid z PaymentIntent
  p.set("payment_intent_data[metadata][invoiceid]", orderId);
  p.set("metadata[invoiceid]", orderId);
  return await stripe("checkout/sessions", p);
}

function newOrderId() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(1000000000 + (a[0] % 1000000000));
}

// --- vytvoreni objednavky --------------------------------------------------
export async function create(supabase: any, email: string, body: any) {
  const key = String(body.checkout_key || "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new Fail("bad_checkout_key");

  // opakovane volani (dvojklik, reload): vratit tu samou objednavku
  const { data: existing } = await supabase
    .from("tilda_orders")
    .select("order_id, payment_status, stripe_session_id, customer_email, pending_deposit, order_total")
    .eq("checkout_key", key)
    .maybeSingle();
  if (existing) {
    if (String(existing.customer_email || "").toLowerCase() !== email) throw new Fail("forbidden", 403);
    if (String(existing.payment_status || "").includes("Оплачено")) {
      return { order_id: existing.order_id, paid: true, url: SUCCESS_URL };
    }
    if (existing.stripe_session_id) {
      const s = await stripe(`checkout/sessions/${existing.stripe_session_id}`, null, "GET");
      if (s.status === "open" && s.url) return { order_id: existing.order_id, paid: false, url: s.url };
    }
    // cely depozitem, ale minule dokonceni selhalo (napr. vypadek DB): dokoncit znovu
    if (!existing.stripe_session_id && Number(existing.pending_deposit) > 0 && Number(existing.pending_deposit) >= Number(existing.order_total)) {
      const { error } = await supabase.rpc("settle_order_payment", { p_order_id: existing.order_id });
      if (error) {
        console.error("settle retry failed", error.message);
        throw new Fail("settle_failed", 500);
      }
      return { order_id: existing.order_id, paid: true, url: SUCCESS_URL };
    }
    throw new Fail("order_already_created", 409);
  }

  const form: Record<string, any> = body.form && typeof body.form === "object" ? body.form : {};
  for (const f of ["name", "last-name", "phone", "email"]) {
    if (!String(form[f] || "").trim()) throw new Fail("missing_" + f);
  }
  if (!String(form.email).includes("@")) throw new Fail("bad_email");

  const q = await quote(supabase, email, body);
  const usesPoints = q.points > 0;
  if (!usesPoints && body.use_deposit !== false && q.deposit <= 0) throw new Fail("no_deposit");
  // hotove jen pri osobnim odberu a jen s body (obycejne hotovostni objednavky jdou pres Tildu)
  const cash = body.pay === "cash";
  if (cash && (body.delivery !== "pickup" || !usesPoints)) throw new Fail("cash_not_allowed");

  const orderId = newOrderId();
  const courier = body.delivery === "courier";
  const deliveryLabel = courier
    ? `Doručení kurýrem + servisní poplatek = ${q.delivery}`
    : `Servisní poplatek = ${PICKUP_FEE}`;
  const paySys = cash ? "cash" : q.card > 0 ? "stripe" : "deposit";

  // stejny tvar dat, jaky posila Tilda -> tilda-webhook ulozi objednavku,
  // spocita cashback, posle Telegram a vsechny databazove triggery bezi jako dosud
  const data: Record<string, any> = {
    ...form,
    ma_email: email,
    formid: "own-checkout",
    paymentsystem: paySys,
    delivery: deliveryLabel,
    delivery_fee_calc: courier ? `server=${q.delivery}` : `pickup=${PICKUP_FEE}`,
    checkout_key: key,
    payment: {
      orderid: orderId,
      amount: String(Math.round((q.total - q.points) * 100) / 100),
      subtotal: String(q.goods),
      delivery: courier ? "Doručení kurýrem + servisní poplatek" : "Servisní poplatek",
      delivery_price: q.delivery,
      delivery_fio: "",
      delivery_address: "",
      delivery_comment: "",
      products: q.lines,
    },
  };
  if (q.km != null) data.delivery_km = String(q.km);
  delete data.promocode;
  delete data["promo-code"];
  // tilda-webhook pozna body podle kodu "Uplatněno<N>bodů": odepise je ze zustatku, ulozi used_points
  // a zapise pohyb v historii. Stejny format jako pri kodu z Tildy, ale s libovolnym N.
  if (usesPoints) data.promocode = `Uplatněno${q.points}bodů`;

  // Stripe session vznika zaroven s ulozenim objednavky (potrebuje jen cislo a castku).
  // Kdyby se objednavka neulozila, session jen vyprsi (31 min) a nikdo za ni nezaplati.
  const sessionPromise = q.card > 0 && !cash ? createStripeSession(orderId, q.card, String(form.email), q.deposit) : null;
  if (sessionPromise) sessionPromise.catch(() => {});

  const hook = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tilda-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!hook.ok) throw new Fail("order_not_saved", 502);

  // jeden dotaz misto "najit radek" + "upravit": vrati id upraveneho radku
  const { data: rows } = await supabase
    .from("tilda_orders")
    .update({
      pending_deposit: q.deposit,
      checkout_source: "own",
      checkout_key: key,
      customer_email: email,
    })
    .eq("order_id", orderId)
    .select("id");
  const row = rows && rows[0];
  if (!row) throw new Fail("order_not_saved", 502);

  if (cash) return { order_id: orderId, paid: false, url: CASH_URL };

  if (q.card <= 0) {
    const { data: r, error } = await supabase.rpc("settle_order_payment", { p_order_id: orderId });
    if (error) {
      console.error("settle failed", error.message);
      throw new Fail("settle_failed", 500);
    }
    console.log("settled", orderId, JSON.stringify(r));
    return { order_id: orderId, paid: true, url: SUCCESS_URL };
  }

  const session = await sessionPromise!;
  await supabase.from("tilda_orders").update({ stripe_session_id: session.id }).eq("id", row.id);
  return { order_id: orderId, paid: false, url: session.url, deposit: q.deposit, points: q.points, card: q.card };
}

// --- vstup -----------------------------------------------------------------
// CHECKOUT_TEST=1 jen pro lokalni testy cen (import bez spusteni serveru)
if (Deno.env.get("CHECKOUT_TEST") !== "1") {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      const body = await req.json();
      const email = await verifyToken(body?.token, Deno.env.get("AUTH_TOKEN_SECRET")!);
      if (!email) throw new Fail("invalid_token", 401);

      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      if (body.action === "warm") {
        // zahrati funkce a pameti s katalogem, aby prvni skutecny dotaz nebyl pomaly
        await loadCatalog(supabase);
        return json({ ok: true });
      }
      if (body.action === "quote") {
        const q = await quote(supabase, email, body);
        return json({ ok: true, goods: q.goods, delivery: q.delivery, total: q.total, balance: q.balance, deposit: q.deposit, points: q.points, card: q.card });
      }
      if (body.action === "points") {
        return json({ ok: true, ...(await pointsInfo(supabase, email, body)) });
      }
      if (body.action === "create") {
        return json({ ok: true, ...(await create(supabase, email, body)) });
      }
      throw new Fail("unknown_action");
    } catch (e) {
      if (e instanceof Fail) return json({ ok: false, error: e.code }, e.status);
      console.error("checkout-order", e);
      return json({ ok: false, error: "server_error" }, 500);
    }
  });
}
