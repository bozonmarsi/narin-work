import { buildInvoiceDoc } from "@/lib/invoice-pdf-core";

// Vola se ze stranky /members/b2b na Tilda (ne z NARIN WORK). Klient se prokazuje tokenem
// (lk_auth_token) v hlavicce Authorization, nikoli e-mailem v URL. Vlastnictvi faktury a
// sestaveni dat dela edge funkce company-portal (action "invoice"), tady se jen kresli PDF.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoice");
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  if (!token || !invoiceId) {
    return Response.json({ error: "Chybí přihlášení nebo číslo faktury" }, { status: 400, headers: CORS });
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${base}/functions/v1/company-portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ action: "invoice", token, invoice_id: invoiceId }),
  });

  if (res.status === 401) return Response.json({ error: "Přihlášení vypršelo" }, { status: 401, headers: CORS });
  if (!res.ok) return Response.json({ error: "Faktura nenalezena nebo nemáte oprávnění" }, { status: 404, headers: CORS });

  const data = await res.json();
  const inv = data.invoice;
  const company = data.company;
  if (!inv || !company) return Response.json({ error: "Faktura nenalezena" }, { status: 404, headers: CORS });

  const { doc, filename } = await buildInvoiceDoc(
    { name: company.name, ico: company.ico, dic: company.dic, billing_address: company.billing_address },
    {
      id: inv.id,
      invoice_number: inv.invoice_number,
      period_start: inv.period_start,
      period_end: inv.period_end,
      total_amount: inv.total_amount,
      due_date: inv.due_date,
      status: inv.status,
      issued_at: inv.issued_at ?? null,
      paid_at: inv.paid_at ?? null,
    },
    data.orders ?? [],
    inv.invoice_number,
    inv.due_date,
  );

  return new Response(doc.output("arraybuffer"), {
    headers: {
      ...CORS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
