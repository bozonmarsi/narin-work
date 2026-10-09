// Server-only — reads BREVO_API_KEY (no NEXT_PUBLIC_ prefix), never reaches
// the browser bundle.

export async function sendBrevoEmail(
  to: string,
  subject: string,
  htmlContent: string,
  attachments?: { content: string; name: string }[],
) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "NARIN", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent,
      ...(attachments && attachments.length ? { attachment: attachments } : {}),
    }),
  });

  if (!res.ok) {
    console.error("Brevo email failed", await res.text());
  }
  return res.ok;
}

// Tilda gives "+420 (776) 421-993", but some orders have a bare "776421993"
// (no country code). Brevo wants digits with the country code and no "+".
export function normalizeSmsPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = "420" + digits;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export async function sendBrevoSms(phone: string, content: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

  const recipient = normalizeSmsPhone(phone);
  if (!recipient) {
    console.error("Brevo SMS skipped: unusable phone number", phone);
    return false;
  }

  const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: (process.env.BREVO_SENDER_NAME || "NARIN").slice(0, 11), // SMS sender IDs are short
      recipient,
      content,
      type: "transactional",
    }),
  });

  if (!res.ok) {
    console.error("Brevo SMS failed", res.status, await res.text());
  }
  return res.ok;
}
