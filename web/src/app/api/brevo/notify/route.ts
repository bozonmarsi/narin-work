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
};

function wrap(bodyHtml: string) {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:480px">${bodyHtml}<p style="margin-top:24px;color:#888;font-size:13px">NARIN — květiny s doručením po Praze</p></div>`;
}

// Called by a Postgres trigger (via pg_net) — same pattern as the Telegram
// notifications, just for customer-facing email/SMS via Brevo instead of
// staff-facing Telegram messages. The trigger gathers everything needed
// (order number, contact info) directly in SQL and hands it over here;
// this route only decides the wording and sends it.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.TELEGRAM_WEBHOOK_SECRET}`;
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || authHeader !== expected) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const payload = (await request.json()) as NotifyPayload;
  const { event, order_id, email, phone, pickup_address } = payload;

  switch (event) {
    case "order_confirmed_stripe":
      if (email) {
        await sendBrevoEmail(
          email,
          `Objednávka č. ${order_id} byla přijata`,
          wrap(
            `<p>Dobrý den,</p><p>Vaše objednávka <strong>č. ${order_id}</strong> byla přijata a platba proběhla úspěšně.</p><p>Budeme Vás informovat o dalším průběhu.</p><p>Děkujeme, tým NARIN.</p>`,
          ),
        );
      }
      break;

    case "order_confirmed_cod":
      if (email) {
        await sendBrevoEmail(
          email,
          `Objednávka č. ${order_id} byla přijata`,
          wrap(
            `<p>Dobrý den,</p><p>Vaše objednávka <strong>č. ${order_id}</strong> byla přijata. Platba proběhne v hotovosti při doručení/vyzvednutí.</p><p>Děkujeme, tým NARIN.</p>`,
          ),
        );
      }
      break;

    case "pickup_ready":
      if (email) {
        await sendBrevoEmail(
          email,
          `Objednávka č. ${order_id} je připravena k vyzvednutí`,
          wrap(
            `<p>Dobrý den,</p><p>Vaše objednávka <strong>č. ${order_id}</strong> je připravena k vyzvednutí na adrese:</p><p><strong>${pickup_address ?? ""}</strong></p><p>Těšíme se na Vás!</p>`,
          ),
        );
      }
      break;

    case "courier_out":
      if (email) {
        await sendBrevoEmail(
          email,
          `Kurýr je na cestě — objednávka č. ${order_id}`,
          wrap(`<p>Dobrý den,</p><p>Váš kurýr právě vyrazil s objednávkou <strong>č. ${order_id}</strong>. Brzy u Vás bude!</p>`),
        );
      }
      break;

    case "delivered":
      if (email) {
        await sendBrevoEmail(
          email,
          `Objednávka č. ${order_id} byla doručena`,
          wrap(`<p>Dobrý den,</p><p>Objednávka <strong>č. ${order_id}</strong> byla úspěšně doručena.</p><p>Děkujeme za nákup u NARIN!</p>`),
        );
      }
      break;

    case "arriving_sms":
      if (phone) {
        await sendBrevoSms(phone, `NARIN: Váš kurýr dorazí přibližně za 10 minut s objednávkou č. ${order_id}.`);
      }
      break;
  }

  return Response.json({ ok: true });
}
