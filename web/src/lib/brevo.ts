// Server-only — reads BREVO_API_KEY (no NEXT_PUBLIC_ prefix), never reaches
// the browser bundle.

export async function sendBrevoEmail(to: string, subject: string, htmlContent: string) {
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
    }),
  });

  if (!res.ok) {
    console.error("Brevo email failed", await res.text());
  }
  return res.ok;
}

export async function sendBrevoSms(phone: string, content: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

  // Brevo wants E.164-ish digits with a leading "+" — strip spaces,
  // parentheses and dashes that Tilda's raw phone format includes.
  const cleanPhone = phone.replace(/[^\d+]/g, "");

  const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: (process.env.BREVO_SENDER_NAME || "NARIN").slice(0, 11), // SMS sender IDs are short
      recipient: cleanPhone,
      content,
      type: "transactional",
    }),
  });

  if (!res.ok) {
    console.error("Brevo SMS failed", await res.text());
  }
  return res.ok;
}
