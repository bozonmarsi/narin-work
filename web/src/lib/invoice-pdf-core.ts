import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { NARIN_LOGO_DATA_URL } from "@/lib/narin-logo-base64";
import { RUBIK_FONT_BASE64 } from "@/lib/rubik-font-base64";

// Чистая отрисовка PDF-счёта — без обращения к Supabase, работает и в
// браузере (invoice-pdf.ts), и на сервере (customer-invoice-pdf route),
// в обоих случаях номер счёта и срок оплаты уже должны быть присвоены
// заранее (тем, кто это делает — менеджером при первой генерации).
//
// ЧЕРНОВИК-ЗАГОТОВКА: набор полей собран по общей практике чешских
// счетов, юридически с бухгалтером/účetní не сверялся.
const SUPPLIER = {
  name: "Tebuev Magomed",
  legalNote: "podnikající fyzická zahraniční osoba (OSVČ)",
  registryNote: "Zapsán v Živnostenském rejstříku vedeném Úřad městské části Praha 1",
  ico: "24498394",
  address: "Školská 660/3, 110 00, Praha 1 — Nové Město",
  email: "support@vezminarin.cz",
  bankAccount: "131-1653100257/0100",
  iban: "CZ6401000001311653100257",
  isVatPayer: false,
  paymentTermDays: 30,
};

const BLUE: [number, number, number] = [24, 108, 224];
const BLUE_LIGHT: [number, number, number] = [229, 240, 253];
const RED: [number, number, number] = [244, 74, 48];
const INK: [number, number, number] = [22, 24, 29];
const MUTED: [number, number, number] = [125, 129, 140];
const LINE: [number, number, number] = [225, 228, 234];
const PANEL: [number, number, number] = [247, 248, 250];
const GREEN: [number, number, number] = [10, 138, 60];
const GREEN_LIGHT: [number, number, number] = [227, 251, 241];

export type CompanyInfo = {
  name: string;
  ico: string | null;
  dic: string | null;
  billing_address: string | null;
};

export type InvoiceInfo = {
  id: string;
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  total_amount: number;
  due_date: string | null;
  // Neni-li zname (starsi volani), faktura se chova jako dosud: vystaveno dnes, k uhrade.
  status?: string | null;
  issued_at?: string | null;
  paid_at?: string | null;
};

// Cast platebniho zaznamu objednavky, ze ktere skladame polozky faktury.
export type OrderPayment = {
  products?: { name?: string | null; price?: string | number | null; amount?: string | number | null; quantity?: string | number | null }[] | null;
  subtotal?: string | number | null;
  delivery?: string | null;
  delivery_price?: string | number | null;
  amount?: string | number | null;
  promocode?: string | null;
  used_points?: string | number | null;
};

export type OrderLineItem = {
  order_id: string | null;
  delivery_date: string | null;
  order_total: number | null;
  payment?: OrderPayment | null;
  // pri volani z aplikace manazera (platebni zaznam je surovy)
  used_points?: number | null;
  top_promo?: string | null;
};

const ENTITIES: Record<string, string> = {
  aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó",
  uacute: "ú", Uacute: "Ú", yacute: "ý", Yacute: "Ý", scaron: "š", Scaron: "Š", ccaron: "č", Ccaron: "Č",
  rcaron: "ř", Rcaron: "Ř", zcaron: "ž", Zcaron: "Ž", ecaron: "ě", Ecaron: "Ě", ncaron: "ň", Ncaron: "Ň",
  dcaron: "ď", Dcaron: "Ď", tcaron: "ť", Tcaron: "Ť", uring: "ů", Uring: "Ů", amp: "&", quot: '"', apos: "'",
  lt: "<", gt: ">", nbsp: " ",
};

function decodeEntities(text: string) {
  return String(text ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m);
}

type InvoiceLine = { name: string; qty: number; unit: number; amount: number; kind: "item" | "delivery" | "discount" | "other" };

// Polozky jedne objednavky tak, aby souctem dali presne castku objednavky
// (zbozi + doruceni + rozdil jako sleva nebo ostatni poplatky).
function orderLines(o: OrderLineItem): InvoiceLine[] {
  const pay = o.payment ? { ...o.payment, promocode: o.payment.promocode ?? o.top_promo ?? null, used_points: o.payment.used_points ?? o.used_points ?? 0 } : o.payment;
  const total = Number(o.order_total ?? 0);
  const lines: InvoiceLine[] = [];
  const products = Array.isArray(pay?.products) ? pay!.products! : [];
  for (const p of products) {
    const qty = Number(p.quantity) || 1;
    const amount = Number(p.amount) || (Number(p.price) || 0) * qty;
    if (!p.name) continue;
    lines.push({ name: decodeEntities(String(p.name)), qty, unit: qty ? amount / qty : amount, amount, kind: "item" });
  }
  if (!lines.length) return [];
  const goods = lines.reduce((sum, l) => sum + l.amount, 0);
  const delivery = Number(pay?.delivery_price) || 0;
  if (delivery > 0) {
    lines.push({ name: decodeEntities(pay?.delivery || "Doručení a servisní poplatek"), qty: 1, unit: delivery, amount: delivery, kind: "delivery" });
  }
  const diff = Math.round((goods + delivery - total) * 100) / 100;
  if (diff > 0.5) {
    // 1 bod = 1 Kč; zbytek rozdilu je slevovy kod
    const points = Math.min(Math.max(Number(pay?.used_points) || 0, 0), diff);
    const rest = Math.round((diff - points) * 100) / 100;
    if (points > 0) lines.push({ name: `Uplatněné věrnostní body (${points} b.)`, qty: 1, unit: -points, amount: -points, kind: "discount" });
    if (rest > 0.5) {
      const code = pay?.promocode ? String(pay.promocode).trim() : "";
      lines.push({ name: code ? `Sleva (slevový kód ${code})` : "Sleva", qty: 1, unit: -rest, amount: -rest, kind: "discount" });
    }
  } else if (diff < -0.5) lines.push({ name: "Ostatní poplatky", qty: 1, unit: -diff, amount: -diff, kind: "other" });
  return lines;
}

function formatDateCz(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("cs-CZ");
}

export function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function buildQrDataUrl(amount: number, variableSymbol: string) {
  const spayd = `SPD*1.0*ACC:${SUPPLIER.iban}*AM:${amount.toFixed(2)}*CC:CZK*X-VS:${variableSymbol}*MSG:Faktura ${variableSymbol}`;
  return QRCode.toDataURL(spayd, { margin: 0, width: 300, color: { dark: "#16181D", light: "#FFFFFF" } });
}

export async function buildInvoiceDoc(
  company: CompanyInfo,
  invoice: InvoiceInfo,
  orders: OrderLineItem[],
  number: string,
  dueDate: string,
) {
  const variableSymbol = number.replace(/\D/g, "");
  // Uz uhrazena faktura (napr. objednavky zaplacene kartou): zadne platebni udaje ani QR,
  // aby ji odberatel omylem nezaplatil podruhe.
  const paid = invoice.status === "paid";
  const issuedDate = invoice.issued_at ? new Date(invoice.issued_at) : new Date();
  const qrDataUrl = paid ? "" : await buildQrDataUrl(invoice.total_amount, variableSymbol);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // jsPDF-ové vestavěné fonty (Helvetica) nepodporují českou diakritiku
  // s háčkem (č, ř, ě, ů, š, ž...) — bez vlastního fontu se text láme a
  // překrývá. Rubik má plné pokrytí Latin Extended-A a je to i firemní
  // font webu.
  doc.addFileToVFS("Rubik-Regular.ttf", RUBIK_FONT_BASE64);
  doc.addFont("Rubik-Regular.ttf", "Rubik", "normal");
  doc.setFont("Rubik");

  const pageW = 210;
  const marginX = 18;
  const contentW = pageW - marginX * 2;

  doc.setFillColor(...RED);
  doc.rect(0, 34, pageW, 1.6, "F");

  const logoW = 34;
  const logoH = logoW * (450 / 1177);
  doc.addImage(NARIN_LOGO_DATA_URL, "PNG", marginX, 17 - logoH / 2, logoW, logoH);

  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text("FAKTURA", pageW - marginX, 12, { align: "right" });
  doc.setFontSize(17);
  doc.setTextColor(...BLUE);
  doc.text(`č. ${number}`, pageW - marginX, 21, { align: "right" });
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(SUPPLIER.isVatPayer ? "Daňový doklad" : "Není plátcem DPH", pageW - marginX, 27, { align: "right" });
  if (paid) {
    doc.setFillColor(...GREEN);
    doc.roundedRect(pageW - marginX - 30, 28.6, 30, 4.6, 1.2, 1.2, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("UHRAZENO", pageW - marginX - 15, 31.9, { align: "center" });
  }

  let y = 47;
  doc.setTextColor(...INK);

  doc.setFillColor(...PANEL);
  doc.roundedRect(marginX, y, contentW, 16, 2, 2, "F");
  const dateColW = contentW / 3;
  const dateCols: [string, string][] = [
    ["Datum vystavení", formatDateCz(issuedDate)],
    paid
      ? ["Uhrazeno dne", formatDateCz(invoice.paid_at ?? issuedDate)]
      : ["Datum splatnosti", formatDateCz(dueDate)],
    ["Období plnění", `${formatDateCz(invoice.period_start)} – ${formatDateCz(invoice.period_end)}`],
  ];
  dateCols.forEach(([label, value], i) => {
    const x = marginX + 6 + i * dateColW;
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y + 6);
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(value, x, y + 12);
  });
  y += 26;

  const colW = contentW / 2 - 4;
  const rightX = marginX + colW + 8;

  function partyBlock(x: number, w: number, title: string, name: string, lines: string[]) {
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.8);
    doc.line(x, y, x, y + 30);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(title.toUpperCase(), x + 4, y + 4);
    doc.setFontSize(11.5);
    doc.setTextColor(...INK);
    doc.text(name, x + 4, y + 11);
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    let ly = y + 17;
    for (const line of lines) {
      const wrapped = doc.splitTextToSize(line, w - 4);
      doc.text(wrapped, x + 4, ly);
      ly += wrapped.length * 4.3;
    }
  }

  partyBlock(marginX, colW, "Dodavatel", SUPPLIER.name, [
    SUPPLIER.legalNote,
    `IČO: ${SUPPLIER.ico}`,
    SUPPLIER.address,
    SUPPLIER.email,
  ]);

  partyBlock(
    rightX,
    colW,
    "Odběratel",
    company.name,
    [company.ico ? `IČO: ${company.ico}` : "", company.dic ? `DIČ: ${company.dic}` : "", company.billing_address ?? ""].filter(
      Boolean,
    ),
  );

  y += 36;

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Předmět plnění: dodání květin a souvisejícího zboží, objednávky uvedené níže.", marginX, y);
  y += 6;

  const money = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`;
  const xName = marginX + 4;
  const xQty = marginX + contentW - 36;
  const xAmt = marginX + contentW - 4;

  doc.setFillColor(...BLUE_LIGHT);
  doc.rect(marginX, y, contentW, 8, "F");
  doc.setFontSize(8);
  doc.setTextColor(...BLUE);
  doc.text("POLOŽKA", xName, y + 5.5);
  doc.text("MNOŽSTVÍ A CENA", xQty, y + 5.5, { align: "right" });
  doc.text("ČÁSTKA", xAmt, y + 5.5, { align: "right" });
  y += 8;

  function ensureSpace(h: number) {
    if (y + h > 266) {
      doc.addPage();
      y = 20;
    }
  }

  orders.forEach((o) => {
    const lines = orderLines(o);
    ensureSpace(lines.length ? 16 : 10);
    doc.setFillColor(...PANEL);
    doc.rect(marginX, y, contentW, 7, "F");
    doc.setFontSize(9);
    doc.setTextColor(...BLUE);
    doc.text(`Objednávka č. ${o.order_id ?? "—"} · doručeno ${o.delivery_date ? formatDateCz(o.delivery_date) : "—"}`, xName, y + 5);
    if (!lines.length) doc.text(money(Number(o.order_total ?? 0)), xAmt, y + 5, { align: "right" });
    y += 7;
    lines.forEach((l) => {
      const nameLines = (doc.splitTextToSize(l.name, xQty - xName - 38) as string[]).slice(0, 2);
      ensureSpace(nameLines.length * 4.6 + 3);
      doc.setFontSize(9.5);
      doc.setTextColor(...(l.kind === "discount" ? GREEN : INK));
      doc.text(nameLines, xName, y + 5);
      if (l.kind === "item") {
        doc.setTextColor(...MUTED);
        doc.text(`${l.qty} × ${money(l.unit)}`, xQty, y + 5, { align: "right" });
      }
      doc.setTextColor(...(l.kind === "discount" ? GREEN : INK));
      doc.text(money(l.amount), xAmt, y + 5, { align: "right" });
      y += nameLines.length * 4.6 + 2.4;
    });
    y += 2;
  });

  doc.setDrawColor(...LINE);
  doc.line(marginX, y, marginX + contentW, y);
  y += 10;

  const totalBoxW = 78;
  const totalBoxX = marginX + contentW - totalBoxW;
  doc.setFillColor(...(paid ? GREEN : BLUE));
  doc.roundedRect(totalBoxX, y, totalBoxW, 16, 2, 2, "F");
  doc.setFontSize(9);
  doc.setTextColor(220, 232, 253);
  doc.text(paid ? "CELKEM (UHRAZENO)" : "CELKEM K ÚHRADĚ", totalBoxX + 6, y + 6);
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(`${invoice.total_amount.toLocaleString("cs-CZ")} Kč`, totalBoxX + totalBoxW - 6, y + 12.5, { align: "right" });
  y += 28;

  if (paid) {
    doc.setFillColor(...GREEN_LIGHT);
    doc.roundedRect(marginX, y - 4, contentW, 22, 2, 2, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREEN);
    doc.text("STAV PLATBY", marginX + 5, y + 2);
    doc.setFontSize(11);
    doc.text("Tato faktura je již uhrazena. Prosíme, neplaťte ji znovu.", marginX + 5, y + 9);
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Uhrazeno dne ${formatDateCz(invoice.paid_at ?? issuedDate)}. Variabilní symbol: ${variableSymbol}.`, marginX + 5, y + 14.5);
    doc.setTextColor(...INK);
  } else {
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("PLATEBNÍ ÚDAJE", marginX, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`Číslo účtu: ${SUPPLIER.bankAccount}`, marginX, y);
    y += 6;
    doc.text(`IBAN: ${SUPPLIER.iban}`, marginX, y);
    y += 6;
    doc.text(`Variabilní symbol: ${variableSymbol}`, marginX, y);
    y += 6;
    doc.setTextColor(...RED);
    doc.setFontSize(9);
    const termDays = Math.round((new Date(dueDate).getTime() - issuedDate.getTime()) / 86400000);
    doc.text(`Splatnost do ${formatDateCz(dueDate)}${termDays > 0 ? ` (${termDays} dní)` : ""}`, marginX, y);
    doc.setTextColor(...INK);

    const qrSize = 32;
    const qrX = marginX + contentW - qrSize;
    const qrY = y - 30;
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Naskenujte v bankovní aplikaci", qrX + qrSize / 2, qrY + qrSize + 4, { align: "center" });

  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.line(marginX, 283, marginX + contentW, 283);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${SUPPLIER.name} · ${SUPPLIER.address}`, marginX, 288);
    doc.text(SUPPLIER.registryNote, marginX, 292);
    doc.text(`${p} / ${pageCount}`, marginX + contentW, 288, { align: "right" });
  }

  return { doc, number, filename: `faktura-${number}-${slug(company.name)}.pdf` };
}

export const PAYMENT_TERM_DAYS = SUPPLIER.paymentTermDays;
