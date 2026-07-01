// Server-only transactional email helper.
//
// Sends via the Resend HTTP API when configured (no extra dependency — just fetch):
//   RESEND_API_KEY  — Resend API key
//   EMAIL_FROM      — verified sender, e.g. "LeasePlease <no-reply@leaseplease.ru>"
//
// When not configured it is a safe no-op (logs + returns { sent:false }), mirroring the
// AI-provider pattern, so the app keeps working until email is set up. SMTP support can be
// added later behind the same interface.

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type SendEmailResult = { sent: boolean; reason?: string; id?: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) {
    console.warn("[email] not configured (RESEND_API_KEY / EMAIL_FROM missing) — skipping send");
    return { sent: false, reason: "not_configured" };
  }

  const to = Array.isArray(input.to) ? input.to : [input.to];
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] send failed", res.status, body);
      return { sent: false, reason: `http_${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: data.id };
  } catch (e) {
    console.error("[email] send error", e);
    return { sent: false, reason: "error" };
  }
}
