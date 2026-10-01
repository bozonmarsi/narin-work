import { sendBrevoEmail, sendBrevoSms } from "@/lib/brevo";

type NotifyPayload = {
  event:
    | "order_confirmed_stripe"
    | "order_confirmed_cod"
    | "pickup_ready"
    | "courier_out"
    | "delivered"
    | "arriving_sms"
    | "occasion_reminder"
    | "occasion_last_call"
    | "gift_sender_fallback"
    | "gift_confirmed"
    | "gift_cancelled";
  order_id: string; // human-readable Tilda order number, e.g. "1948856243"
  email?: string;
  phone?: string;
  pickup_address?: string;
  recipient_name?: string | null;
  products_text?: string | null;
  order_total?: number | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  // occasion_reminder / occasion_last_call (SQL send_occasion_reminders)
  days?: number;
  items?: OccasionItem[];
  // dárek bez adresy (SQL gift_tick / gift_close, edge funkce gift-link)
  sender_link?: string;
  expires_at?: string;
  reason?: "expired" | "opted_out";
};

type OccasionItem = {
  key: string;
  date: string; // YYYY-MM-DD
  kind: "date" | "holiday" | "birthday" | "nameday" | "general";
  title: string;
  person: string | null;
  recipient_id: string | null;
  years: number | null;
  budget?: number | null;
  gift_prefs?: string[];
  autopilot?: boolean;
  // konkrétní dárky skladem (SQL occ_gift_suggestions): oblíbené první, pak do rozpočtu
  suggestions?: { name: string; price: number | null; photo_url: string | null; product_url: string | null; picked?: boolean }[];
};

const LOGO_URL = "https://static.tildacdn.com/tild3131-3033-4536-a130-623830646536/Photoroom_20260804_1.PNG";
const PETAL_ICON_URL = "https://static.tildacdn.com/tild6661-3363-4132-b139-616631346264/nar_Klient.svg";
const ORDERS_URL = "https://vezminarin.cz/members/orders";
const COLLECTION_URL = "https://vezminarin.cz/members/collection";
const REVIEW_URL = "https://vezminarin.cz/members/review";

const INK = "#16181d";
const MUTED = "#7d818c";
const LINE = "#edeef1";
const CHIP_BG = "#f4f5f7";
const ACCENT = "#186ce0";
const ACCENT_BG = "#e5f0fd";
const PREPARING = "#f44a30";
const PREPARING_BG = "#fde9e5";
const COURIER = "#10b981";
const COURIER_BG = "#e2f8f0";

// Email-safe: table-based layout, inline styles only, no <style>/flexbox/SVG
// (Outlook's Word engine и часть Gmail это либо игнорируют, либо вырезают).
// Иконки — эмодзи в цветном кружке вместо SVG, чтобы не зависеть от
// поддержки клиентом.
function emailShell(opts: {
  preheader: string;
  badgeEmoji: string;
  badgeBg: string;
  headline: string;
  bodyHtml: string;
  extraHtml?: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  footNote?: string; // místo věty o průběhu objednávky (u připomínek nedává smysl)
}) {
  const { preheader, badgeEmoji, badgeBg, headline, bodyHtml, extraHtml = "", ctaLabel, ctaUrl, secondaryCtaLabel, secondaryCtaUrl, footNote } = opts;

  const secondaryCta = secondaryCtaLabel && secondaryCtaUrl
    ? `<a href="${secondaryCtaUrl}" style="display:inline-block;margin-left:10px;padding:11px 20px;border-radius:999px;border:1px solid ${LINE};color:${ACCENT};font-size:13px;font-weight:600;text-decoration:none;font-family:'Rubik',Arial,sans-serif;">${secondaryCtaLabel}</a>`
    : "";

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Rubik',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:30px 30px 26px;">

        <img src="${LOGO_URL}" alt="NARIN — květinový atelier" width="150" style="display:block;height:auto;margin-bottom:22px;border:0;">

        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td
          style="width:52px;height:52px;border-radius:50%;background:${badgeBg};text-align:center;vertical-align:middle;font-size:24px;line-height:52px;">${badgeEmoji}</td></tr></table>

        <div style="height:16px;"></div>
        <h1 style="margin:0 0 8px;font-size:18.5px;font-weight:600;color:${INK};">${headline}</h1>
        <p style="margin:0 0 18px;font-size:13.5px;line-height:1.65;color:${MUTED};max-width:44ch;">${bodyHtml}</p>

        ${extraHtml}

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
          <tr>
            <td style="font-size:12px;color:${MUTED};font-family:'Rubik',Arial,sans-serif;">
              ${footNote ?? `Průběh objednávky sledujte kdykoliv ve <a href="${ORDERS_URL}" style="color:${ACCENT};text-decoration:none;font-weight:500;">svém profilu</a>.`}
            </td>
          </tr>
        </table>

        <div>
          <a href="${ctaUrl}" style="display:inline-block;padding:11px 20px;border-radius:999px;background:${ACCENT};color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;font-family:'Rubik',Arial,sans-serif;">${ctaLabel}</a>${secondaryCta}
        </div>

        <div style="border-top:1px solid ${LINE};margin-top:22px;padding-top:14px;font-size:11px;color:${MUTED};line-height:1.6;">
          NARIN — květinový atelier s doručením po Praze<br>Automatická zpráva, na tento e-mail prosím neodpovídejte.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function recipientRow(recipientName?: string | null) {
  if (!recipientName) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CHIP_BG};border-radius:10px;margin-bottom:18px;">
    <tr><td style="padding:9px 12px;font-size:12.5px;color:${INK};font-family:'Rubik',Arial,sans-serif;">
      <span style="color:${MUTED};">Kytice poputuje k:</span> <b>${recipientName}</b>
    </td></tr>
  </table>`;
}

function productsBlock(productsText?: string | null, orderTotal?: number | null) {
  if (!productsText && !orderTotal) return "";
  const rows = (productsText || "")
    .split("\n")
    .filter(Boolean)
    .map(
      (line) =>
        `<tr><td style="padding:3px 0;font-size:12.5px;color:${INK};">${line}</td></tr>`,
    )
    .join("");
  const totalRow = orderTotal
    ? `<tr><td style="padding-top:8px;margin-top:4px;border-top:1px dashed ${LINE};font-size:13px;font-weight:600;color:${INK};">Celkem: ${orderTotal} Kč</td></tr>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};margin-bottom:16px;"><tr><td style="padding:12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}${totalRow}</table>
  </td></tr></table>`;
}

// Klikatelné hodnocení přímo v e-mailu — každý kvítek vede rovnou na
// stránku recenze s předvyplněným hodnocením (order + rating v URL),
// takže odpověď zabere jeden klik místo dvou.
function ratingRow(orderId: string) {
  const cells = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<td style="padding:0 4px;"><a href="${REVIEW_URL}?order=${encodeURIComponent(orderId)}&rating=${n}"><img src="${PETAL_ICON_URL}" width="32" height="23" alt="${n}" style="display:block;border:0;"></a></td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:6px;"><tr>${cells}</tr></table>
    <p style="margin:0 0 18px;font-size:11.5px;color:${MUTED};">Klepněte na hodnocení — otevře se rovnou vyplněné.</p>`;
}

function deliveryWhenLine(date?: string | null, time?: string | null) {
  const parts = [date, time].filter(Boolean);
  if (!parts.length) return "";
  return `<p style="margin:0 0 14px;font-size:12.5px;color:${MUTED};">Termín doručení: <b style="color:${INK};">${parts.join(" · ")}</b></p>`;
}

// ---------- Occasions: připomínky důležitých dnů ----------
const OCCASIONS_URL = "https://vezminarin.cz/members/occasions";
const CZ_DAYS = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
const CZ_MONTHS = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const OCC_EMOJI: Record<OccasionItem["kind"], string> = { birthday: "🎂", nameday: "🌼", holiday: "💐", general: "💐", date: "📅" };

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function czDate(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  return `${CZ_DAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${CZ_MONTHS[d.getUTCMonth()]}`;
}
function occTitle(it: OccasionItem) {
  if (it.kind === "birthday" && it.years) return `${it.years}. narozeniny`;
  if (it.kind === "date" && it.years) return `${it.title} (${it.years}. výročí)`;
  return it.title;
}
// Odkaz "Vybrat květiny": přes /members/occasions, který si zapamatuje příjemce
// a datum a přesměruje do katalogu; na pokladně se příjemce sám předvybere.
function occOrderUrl(it: OccasionItem, productUrl?: string | null) {
  const q = new URLSearchParams({ objednat: it.recipient_id ?? "", datum: it.date });
  if (productUrl) q.set("produkt", productUrl);
  return `${OCCASIONS_URL}?${q.toString()}`;
}
const GIFT_LABELS: Record<string, string> = {
  kytice: "kytice", prani: "přání", sladkosti: "sladkosti", hracky: "hračky", nadobi: "nádobí", textil: "textil", doplnky: "doplňky", na_vas: "na vašem výběru",
};
// 1–3 dárky skladem s fotkou; klik vede přes Důležité dny (zapamatuje příjemce) na kartu produktu
function giftCards(it: OccasionItem) {
  const list = (it.suggestions ?? []).slice(0, 3);
  if (!list.length) return "";
  const cells = list
    .map((g) => {
      const href = occOrderUrl(it, g.product_url);
      const img = g.photo_url
        ? `<img src="${esc(g.photo_url)}" alt="" width="148" height="148" style="display:block;width:100%;max-width:148px;height:148px;object-fit:cover;border-radius:12px;border:0;">`
        : `<div style="height:96px;border-radius:12px;background:${CHIP_BG};text-align:center;line-height:96px;font-size:30px;">🎁</div>`;
      return `<td width="33%" style="vertical-align:top;padding:0 4px;">
        <a href="${href}" style="text-decoration:none;color:${INK};font-family:'Rubik',Arial,sans-serif;">${img}
          <div style="font-size:12.5px;font-weight:600;margin-top:6px;line-height:1.3;">${g.picked ? "❤️ " : ""}${esc(g.name)}</div>
          ${g.price ? `<div style="font-size:12px;color:${ACCENT};font-weight:600;margin-top:2px;">${Math.round(g.price).toLocaleString("cs-CZ")} Kč</div>` : ""}
        </a></td>`;
    })
    .join("");
  const pad = list.length < 3 ? `<td width="${(3 - list.length) * 33}%"></td>` : "";
  return `<div style="font-size:12px;color:${MUTED};margin:12px 0 8px;">K tomu můžeme přidat (máme skladem):</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 -4px;"><tr>${cells}${pad}</tr></table>`;
}
function giftLine(it: OccasionItem) {
  const prefs = (it.gift_prefs ?? []).filter((g) => g !== "na_vas").map((g) => GIFT_LABELS[g] ?? g);
  const bits = [];
  if (prefs.length) bits.push(prefs.join(", "));
  if (it.budget) bits.push(`do ${it.budget.toLocaleString("cs-CZ")} Kč`);
  return bits.length ? `<div style="font-size:12.5px;color:${ACCENT};margin-top:3px;">Tip: ${esc(bits.join(" · "))}</div>` : "";
}

function occasionRows(items: OccasionItem[]) {
  return items
    .map((it) => {
      const who = it.person ? `<div style="font-size:12.5px;color:${MUTED};margin-top:2px;">pro <b style="color:${INK};">${esc(it.person)}</b></div>` : "";
      return `<tr><td style="padding:12px 0;border-bottom:1px solid ${LINE};">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="width:44px;vertical-align:top;font-size:22px;line-height:30px;">${OCC_EMOJI[it.kind] ?? "💐"}</td>
          <td style="vertical-align:top;font-family:'Rubik',Arial,sans-serif;">
            <div style="font-size:14.5px;font-weight:600;color:${INK};">${esc(occTitle(it))}</div>${who}
            <div style="font-size:12.5px;color:${MUTED};margin-top:2px;">${czDate(it.date)}</div>${giftLine(it)}
          </td>
          <td style="vertical-align:middle;text-align:right;white-space:nowrap;">
            <a href="${occOrderUrl(it)}" style="display:inline-block;padding:8px 14px;border-radius:999px;background:${ACCENT_BG};color:${ACCENT};font-size:12.5px;font-weight:600;text-decoration:none;font-family:'Rubik',Arial,sans-serif;">Vybrat květiny</a>
          </td>
        </tr></table>${giftCards(it)}
      </td></tr>`;
    })
    .join("");
}
function occasionEmail(items: OccasionItem[], days: number, lastCall: boolean) {
  const first = items[0];
  const when = days === 1 ? "zítra" : `za ${days} ${days >= 2 && days <= 4 ? "dny" : "dní"}`;
  const one = items.length === 1;
  const label = one ? `${occTitle(first)}${first.person ? ` – ${first.person}` : ""}` : `${items.length} důležité dny`;
  const subject = lastCall ? `Poslední šance: ${label} je ${when} 💐` : `${when.charAt(0).toUpperCase() + when.slice(1)}: ${label} 💐`;
  const headline = lastCall
    ? one ? `${occTitle(first)} je už ${when}` : `Už ${when} slavíte ${items.length}×`
    : one ? `${occTitle(first)} ${first.person ? `– ${esc(first.person)} ` : ""}${when}` : `Blíží se ${items.length} důležité dny`;
  // Autopilot: 2 dny před svátkem ráno vznikne objednávka (SQL send_occasion_reminders, krok 2),
  // takže klient má na vlastní výběr čas do večera 3 dny předem.
  const auto = lastCall ? [] : items.filter((it) => it.autopilot && it.person);
  const cutoff = auto.length
    ? czDate(new Date(new Date(auto[0].date + "T12:00:00Z").getTime() - 3 * 86400000).toISOString().slice(0, 10))
    : "";
  const autoNote = auto.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${COURIER_BG};border-radius:12px;margin-bottom:18px;"><tr>
        <td style="padding:12px 14px;font-size:20px;width:36px;vertical-align:top;">🤝</td>
        <td style="padding:12px 14px 12px 0;font-size:12.5px;line-height:1.55;color:${INK};font-family:'Rubik',Arial,sans-serif;">
          <b>Máte zapnutý autopilot.</b> Pokud pro ${esc(auto.map((a) => a.person).join(", "))} nic nevyberete do ${cutoff} večera, připravíme dárek podle vašich přání sami a zaplatíte ho z depozitu. Změnit nebo zrušit to můžete odpovědí v chatu.
        </td></tr></table>`
    : "";
  const bodyHtml = lastCall
    ? `Ještě to stihneme. Objednejte dnes a kytici doručíme přesně na den.`
    : `Ozýváme se včas, ať máte klid. Vyberte květiny teď a my je doručíme přesně v ten den.`;
  const list = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid ${LINE};margin-bottom:18px;">${occasionRows(items)}</table>`;
  return {
    subject,
    html: emailShell({
      preheader: lastCall ? `Poslední šance objednat včas: ${label}` : `${label} – ${czDate(first.date)}`,
      badgeEmoji: lastCall ? "⏰" : OCC_EMOJI[first.kind] ?? "💐",
      badgeBg: lastCall ? PREPARING_BG : ACCENT_BG,
      headline,
      bodyHtml,
      extraHtml: list + autoNote,
      ctaLabel: one ? "Vybrat květiny" : "Do katalogu",
      ctaUrl: one ? occOrderUrl(first) : "https://vezminarin.cz/page118819546.html",
      secondaryCtaLabel: "Upravit připomínky",
      secondaryCtaUrl: OCCASIONS_URL,
      footNote: `Tyto připomínky jste si nastavili v <a href="${OCCASIONS_URL}" style="color:${ACCENT};text-decoration:none;font-weight:500;">Důležitých dnech</a>. Kolik dní předem, nebo je úplně vypnout, změníte tamtéž.`,
    }),
  };
}

// Called by a Postgres trigger (via pg_net) — same pattern as the Telegram
// notifications, just for customer-facing email/SMS via Brevo instead of
// staff-facing Telegram messages. The trigger gathers everything needed
// directly in SQL and hands it over here; this route only decides the
// wording/markup and sends it.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.TELEGRAM_WEBHOOK_SECRET}`;
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || authHeader !== expected) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const payload = (await request.json()) as NotifyPayload;
  const { event, order_id, email, phone, pickup_address, recipient_name, products_text, order_total, delivery_date, delivery_time } = payload;

  switch (event) {
    case "order_confirmed_stripe":
      if (email) {
        await sendBrevoEmail(
          email,
          `Objednávku jsme přijali, děkujeme 🌷`,
          emailShell({
            preheader: `Objednávka č. ${order_id} byla přijata a zaplacena.`,
            badgeEmoji: "✓",
            badgeBg: ACCENT_BG,
            headline: "Objednávku jsme přijali, děkujeme",
            bodyHtml: `Dobrý den, moc si vážíme, že jste si vybrali náš atelier. Platba proběhla v pořádku a my se teď s láskou pustíme do přípravy vaší kytice.`,
            extraHtml: recipientRow(recipient_name) + productsBlock(products_text, order_total) + deliveryWhenLine(delivery_date, delivery_time),
            ctaLabel: "Zobrazit objednávku",
            ctaUrl: `${ORDERS_URL}`,
          }),
        );
      }
      break;

    case "order_confirmed_cod":
      if (email) {
        await sendBrevoEmail(
          email,
          `Objednávku jsme přijali, děkujeme 🌷`,
          emailShell({
            preheader: `Objednávka č. ${order_id} byla přijata.`,
            badgeEmoji: "✓",
            badgeBg: ACCENT_BG,
            headline: "Objednávku jsme přijali, děkujeme",
            bodyHtml: `Dobrý den, moc si vážíme vaší objednávky a už se těšíme, až kytici připravíme. Zaplatíte pohodlně až při doručení nebo vyzvednutí.`,
            extraHtml: recipientRow(recipient_name) + productsBlock(products_text, order_total) + deliveryWhenLine(delivery_date, delivery_time),
            ctaLabel: "Zobrazit objednávku",
            ctaUrl: `${ORDERS_URL}`,
          }),
        );
      }
      break;

    case "pickup_ready":
      if (email) {
        const infoBox = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${PREPARING_BG};border-radius:12px;margin-bottom:18px;"><tr><td style="padding:13px 15px;font-size:13px;color:${INK};line-height:1.5;">
          <span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${PREPARING};margin-bottom:3px;">Adresa vyzvednutí</span>${pickup_address ?? ""}
        </td></tr></table>`;
        await sendBrevoEmail(
          email,
          `Vaše kytice je hotová a čeká na vás`,
          emailShell({
            preheader: `Objednávka č. ${order_id} je připravena k vyzvednutí.`,
            badgeEmoji: "🌼",
            badgeBg: PREPARING_BG,
            headline: "Vaše kytice je hotová",
            bodyHtml: `S láskou jsme ji pro vás dokončili a už čeká v ateliéru. Budeme se moc těšit, až se u nás zastavíte.`,
            extraHtml: infoBox,
            ctaLabel: "Zobrazit objednávku",
            ctaUrl: `${ORDERS_URL}`,
          }),
        );
      }
      break;

    case "courier_out":
      if (email) {
        await sendBrevoEmail(
          email,
          `Kurýr právě vyrazil s vaší kyticí`,
          emailShell({
            preheader: `Kurýr je na cestě — objednávka č. ${order_id}.`,
            badgeEmoji: "🚚",
            badgeBg: COURIER_BG,
            headline: "Kurýr je na cestě",
            bodyHtml: `Vaše objednávka právě vyrazila z ateliéru. Za malou chvíli zazvoní u dveří — přejeme krásné převzetí!`,
            ctaLabel: "Sledovat doručení",
            ctaUrl: `${ORDERS_URL}`,
          }),
        );
      }
      break;

    case "delivered":
      if (email) {
        const stickerBox = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fdf1e9;border-radius:12px;margin-bottom:18px;"><tr>
          <td style="padding:12px 14px;font-size:22px;width:40px;">🌼</td>
          <td style="padding:12px 14px 12px 0;font-size:12.5px;line-height:1.5;color:${INK};">Touto objednávkou jste si vysbírali novou samolepku do sbírky. <a href="${COLLECTION_URL}" style="color:${ACCENT};font-weight:600;text-decoration:none;">Podívat se do galerie →</a></td>
        </tr></table>`;
        const askReview = `<p style="margin:0 0 6px;font-size:13.5px;line-height:1.65;color:${MUTED};">Jak se vám kytice líbila? Jako poděkování za pár slov vám připíšeme <b style="color:${INK};">10 bodů</b> navíc.</p>`;
        await sendBrevoEmail(
          email,
          `Kytice je doručena — děkujeme! 💐`,
          emailShell({
            preheader: `Objednávka č. ${order_id} byla doručena.`,
            badgeEmoji: "📦",
            badgeBg: ACCENT_BG,
            headline: "Kytice je doručena",
            bodyHtml: `Moc děkujeme, že jste si vybrali právě nás — je pro nás ctí být součástí vaší chvíle.`,
            extraHtml: stickerBox + askReview + ratingRow(order_id),
            ctaLabel: "Zobrazit objednávku",
            ctaUrl: ORDERS_URL,
          }),
        );
      }
      break;

    case "occasion_reminder":
    case "occasion_last_call":
      if (email && Array.isArray(payload.items) && payload.items.length) {
        const { subject, html } = occasionEmail(payload.items, Number(payload.days) || 3, event === "occasion_last_call");
        await sendBrevoEmail(email, subject, html);
      }
      break;

    // ---------- dárek bez adresy: e-maily odesílateli ----------
    case "gift_sender_fallback":
      if (email && payload.sender_link) {
        const who = recipient_name ? esc(recipient_name) : "Příjemce";
        await sendBrevoEmail(
          email,
          `${recipient_name ?? "Příjemce"} zatím adresu nezadal(a) — znáte ji?`,
          emailShell({
            preheader: `Dárek č. ${order_id} čeká na adresu.`,
            badgeEmoji: "🎁",
            badgeBg: "#fde9f0",
            headline: `${who} zatím adresu nezadal(a)`,
            bodyHtml: `Napsali jsme a připomněli se, ale adresa zatím nepřišla. Když ji mezitím zjistíte, můžete ji zadat sami a kytici doručíme. Odkaz platí do ${esc(payload.expires_at ?? "")}; pak objednávku zrušíme a peníze vám vrátíme.`,
            ctaLabel: "Zadat adresu sám",
            ctaUrl: payload.sender_link,
            footNote: "Když adresu neznáte, nemusíte nic dělat. Dáme vám vědět, jak to dopadlo.",
          }),
        );
      }
      break;

    case "gift_confirmed":
      if (email) {
        await sendBrevoEmail(
          email,
          `${recipient_name ?? "Příjemce"} si vybral(a), kam doručit 🎉`,
          emailShell({
            preheader: `Dárek č. ${order_id}: adresa je zadaná.`,
            badgeEmoji: "🎉",
            badgeBg: ACCENT_BG,
            headline: `Hotovo, ${recipient_name ? esc(recipient_name) : "příjemce"} zadal(a) adresu`,
            bodyHtml: `Kytici doručíme tam a tehdy, kdy se to příjemci hodí. Adresu kvůli soukromí příjemce neukazujeme, jen termín.`,
            extraHtml: deliveryWhenLine(delivery_date, delivery_time),
            ctaLabel: "Zobrazit objednávku",
            ctaUrl: ORDERS_URL,
          }),
        );
      }
      break;

    case "gift_cancelled":
      if (email) {
        const why = payload.reason === "opted_out"
          ? "Příjemce se rozhodl dárek nepřijmout."
          : "Příjemce do 48 hodin adresu nezadal.";
        await sendBrevoEmail(
          email,
          `Dárek jsme nedoručili, peníze vám vrátíme`,
          emailShell({
            preheader: `Objednávka č. ${order_id} je zrušená.`,
            badgeEmoji: "🤍",
            badgeBg: "#f4f5f7",
            headline: "Dárek jsme bohužel nedoručili",
            bodyHtml: `${why} Objednávku jsme zrušili a${order_total ? ` ${Math.round(order_total).toLocaleString("cs-CZ")} Kč` : " peníze"} vám vrátíme na kartu do několika pracovních dní. Uplatněné body jsou už zpátky na vašem účtu.`,
            ctaLabel: "Poslat kytici jinak",
            ctaUrl: "https://vezminarin.cz/page118819546.html",
            footNote: "Kdybyste chtěli kytici poslat znovu s adresou, rádi pomůžeme.",
          }),
        );
      }
      break;

    case "arriving_sms":
      if (phone) {
        await sendBrevoSms(phone, `Kurýr už je za rohem — vaše květiny dorazí do 10 minut! Připravte se!!! 🌷`);
      }
      break;
  }

  return Response.json({ ok: true });
}
