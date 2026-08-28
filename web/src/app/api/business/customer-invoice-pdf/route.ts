import { createClient } from "@supabase/supabase-js";
import { buildInvoiceDoc } from "@/lib/invoice-pdf-core";

// Вызывается прямо со страницы /members/business на Tilda (не из
// NARIN WORK) — у клиента нет сессии менеджера, только email из
// localStorage. Владение счётом проверяется внутри RPC
// get_invoice_with_company/list_invoice_period_orders — тот же принцип
// "доступ по email", что и у остальных customer-facing RPC этой сессии.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const invoiceId = searchParams.get("invoice");

  if (!email || !invoiceId) {
    return Response.json({ error: "Chybí email nebo invoice" }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const { data: invoiceRows, error: invoiceErr } = await supabase.rpc("get_invoice_with_company", {
    p_email: email,
    p_invoice_id: invoiceId,
  });

  if (invoiceErr || !invoiceRows || invoiceRows.length === 0) {
    return Response.json({ error: "Faktura nenalezena nebo nemáte oprávnění" }, { status: 404 });
  }

  const row = invoiceRows[0];

  if (!row.invoice_number || !row.due_date) {
    // Черновик (менеджер ещё не отправил) клиенту не показываем вообще
    // на странице списка, но подстраховываемся и тут.
    return Response.json({ error: "Faktura ještě není vystavena" }, { status: 404 });
  }

  const { data: orders } = await supabase.rpc("list_invoice_period_orders", {
    p_email: email,
    p_invoice_id: invoiceId,
  });

  const { doc, filename } = await buildInvoiceDoc(
    {
      name: row.company_name,
      ico: row.company_ico,
      dic: row.company_dic,
      billing_address: row.company_billing_address,
    },
    {
      id: row.invoice_id,
      invoice_number: row.invoice_number,
      period_start: row.period_start,
      period_end: row.period_end,
      total_amount: row.total_amount,
      due_date: row.due_date,
    },
    orders ?? [],
    row.invoice_number,
    row.due_date,
  );

  const bytes = doc.output("arraybuffer");

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
