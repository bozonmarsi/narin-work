import { sendBrevoEmail, sendBrevoSms } from "@/lib/brevo";

type NotifyPayload = {
  event:
    | "order_confirmed_stripe"
    | "order_confirmed_cod"
    | "pickup_ready"
    | "courier_out"
    | "delivered"
    | "arriving_sms";
  order_id: string; // human-readable Tilda order number, e.g. "1948856243"
  email?: string;
  phone?: string;
  pickup_address?: string;
  recipient_name?: string | null;
  products_text?: string | null;
  order_total?: number | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
};

const LOGO_URL = "https://static.tildacdn.com/tild3131-3033-4536-a130-623830646536/Photoroom_20260804_1.PNG";
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
}) {
  const { preheader, badgeEmoji, badgeBg, headline, bodyHtml, extraHtml = "", ctaLabel, ctaUrl, secondaryCtaLabel, secondaryCtaUrl } = opts;

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
              Průběh objednávky sledujte kdykoliv ve <a href="${ORDERS_URL}" style="color:${ACCENT};text-decoration:none;font-weight:500;">svém profilu</a>.
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

function deliveryWhenLine(date?: string | null, time?: string | null) {
  const parts = [date, time].filter(Boolean);
  if (!parts.length) return "";
  return `<p style="margin:0 0 14px;font-size:12.5px;color:${MUTED};">Termín doručení: <b style="color:${INK};">${parts.join(" · ")}</b></p>`;
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
        const askReview = `<p style="margin:0 0 14px;font-size:13.5px;line-height:1.65;color:${MUTED};">Byli bychom moc rádi za pár slov o tom, jak se vám kytice líbila — a jako poděkování za váš čas vám připíšeme <b style="color:${INK};">10 bodů</b> navíc.</p>`;
        await sendBrevoEmail(
          email,
          `Kytice je doručena — děkujeme! 💐`,
          emailShell({
            preheader: `Objednávka č. ${order_id} byla doručena.`,
            badgeEmoji: "📦",
            badgeBg: ACCENT_BG,
            headline: "Kytice je doručena",
            bodyHtml: `Moc děkujeme, že jste si vybrali právě nás — je pro nás ctí být součástí vaší chvíle.`,
            extraHtml: stickerBox + askReview,
            ctaLabel: "Ohodnotit objednávku",
            ctaUrl: `${REVIEW_URL}?order=${encodeURIComponent(order_id)}`,
            secondaryCtaLabel: "Zobrazit objednávku",
            secondaryCtaUrl: ORDERS_URL,
          }),
        );
      }
      break;

    case "arriving_sms":
      if (phone) {
        await sendBrevoSms(phone, `Narin: Kurýr s vaší kyticí dorazí přibližně za 10 minut. Těšíme se, až vám udělá radost! 🌷`);
      }
      break;
  }

  return Response.json({ ok: true });
}
