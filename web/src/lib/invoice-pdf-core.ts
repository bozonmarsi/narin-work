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
};

export type OrderLineItem = {
  order_id: string | null;
  delivery_date: string | null;
  order_total: number | null;
};

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
  const qrDataUrl = await buildQrDataUrl(invoice.total_amount, variableSymbol);

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

  let y = 47;
  doc.setTextColor(...INK);

  doc.setFillColor(...PANEL);
  doc.roundedRect(marginX, y, contentW, 16, 2, 2, "F");
  const dateColW = contentW / 3;
  const dateCols: [string, string][] = [
    ["Datum vystavení", formatDateCz(new Date())],
    ["Datum splatnosti", formatDateCz(dueDate)],
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

  y += 40;

  doc.setFillColor(...BLUE_LIGHT);
  doc.rect(marginX, y, contentW, 8, "F");
  doc.setFontSize(8);
  doc.setTextColor(...BLUE);
  doc.text("DATUM DORUČENÍ", marginX + 4, y + 5.5);
  doc.text("OBJEDNÁVKA", marginX + 60, y + 5.5);
  doc.text("ČÁSTKA", marginX + contentW - 4, y + 5.5, { align: "right" });
  y += 8;

  doc.setFontSize(10);
  orders.forEach((o, i) => {
    if (y > 262) {
      doc.addPage();
      y = 20;
    }
    if (i % 2 === 1) {
      doc.setFillColor(...PANEL);
      doc.rect(marginX, y, contentW, 8, "F");
    }
    doc.setTextColor(...INK);
    doc.text(o.delivery_date ? formatDateCz(o.delivery_date) : "—", marginX + 4, y + 5.5);
    doc.text(`č. ${o.order_id ?? "—"}`, marginX + 60, y + 5.5);
    doc.text(`${(o.order_total ?? 0).toLocaleString("cs-CZ")} Kč`, marginX + contentW - 4, y + 5.5, { align: "right" });
    y += 8;
  });

  doc.setDrawColor(...LINE);
  doc.line(marginX, y, marginX + contentW, y);
  y += 10;

  const totalBoxW = 78;
  const totalBoxX = marginX + contentW - totalBoxW;
  doc.setFillColor(...BLUE);
  doc.roundedRect(totalBoxX, y, totalBoxW, 16, 2, 2, "F");
  doc.setFontSize(9);
  doc.setTextColor(220, 232, 253);
  doc.text("CELKEM K ÚHRADĚ", totalBoxX + 6, y + 6);
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(`${invoice.total_amount.toLocaleString("cs-CZ")} Kč`, totalBoxX + totalBoxW - 6, y + 12.5, { align: "right" });
  y += 28;

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
  doc.text(`Splatnost do ${formatDateCz(dueDate)} (${SUPPLIER.paymentTermDays} dní)`, marginX, y);
  doc.setTextColor(...INK);

  const qrSize = 32;
  const qrX = marginX + contentW - qrSize;
  const qrY = y - 30;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("Naskenujte v bankovní aplikaci", qrX + qrSize / 2, qrY + qrSize + 4, { align: "center" });

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
