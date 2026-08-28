import { createClient } from "@/lib/supabase/client";
import { buildInvoiceDoc, PAYMENT_TERM_DAYS, type CompanyInfo, type InvoiceInfo, type OrderLineItem } from "@/lib/invoice-pdf-core";

function formatDateCz(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("cs-CZ");
}

// Номер присваивается один раз, при первой генерации PDF (не при
// создании черновика) — по году выставления, не по периоду счёта, чтобы
// удалённые/пересчитанные черновики не оставляли дыр в нумерации.
async function ensureInvoiceNumber(invoice: InvoiceInfo): Promise<{ number: string; dueDate: string }> {
  const supabase = createClient();

  if (invoice.invoice_number) {
    return { number: invoice.invoice_number, dueDate: invoice.due_date ?? formatDateCz(new Date()) };
  }

  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("company_invoices")
    .select("id", { count: "exact", head: true })
    .not("invoice_number", "is", null)
    .gte("created_at", `${year}-01-01`)
    .lt("created_at", `${year + 1}-01-01`);

  const number = `${year}${String((count ?? 0) + 1).padStart(3, "0")}`;
  const dueDateIso = new Date(Date.now() + PAYMENT_TERM_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await supabase
    .from("company_invoices")
    .update({ invoice_number: number, issued_at: new Date().toISOString(), due_date: dueDateIso })
    .eq("id", invoice.id);

  return { number, dueDate: dueDateIso };
}

export async function generateAndDownloadInvoicePdf(company: CompanyInfo, invoice: InvoiceInfo, orders: OrderLineItem[]) {
  const { number, dueDate } = await ensureInvoiceNumber(invoice);
  const { doc, filename } = await buildInvoiceDoc(company, invoice, orders, number, dueDate);
  doc.save(filename);
}

// Для отправки по email — тот же документ, но как base64 для вложения
// вместо скачивания на диск.
export async function generateInvoicePdfAttachment(company: CompanyInfo, invoice: InvoiceInfo, orders: OrderLineItem[]) {
  const { number, dueDate } = await ensureInvoiceNumber(invoice);
  const { doc, filename } = await buildInvoiceDoc(company, invoice, orders, number, dueDate);
  const dataUri = doc.output("datauristring");
  const base64 = dataUri.split(",")[1];
  return { base64, filename, number };
}
