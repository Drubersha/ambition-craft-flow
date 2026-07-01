// Server-only transactional email helper — UniSender Go (российский сервис).
//
// Config (env, server-only):
//   UNISENDER_GO_API_KEY  — API-ключ проекта UniSender Go
//   EMAIL_FROM            — отправитель: "LeasePlease <no-reply@leaseplease.ru>"
//                           (домен/адрес должен быть подтверждён в UniSender Go)
//   UNISENDER_GO_API_URL  — (опц.) переопределение эндпоинта под свой дата-центр,
//                           напр. https://go1.unisender.ru/ru/transactional/api/v1/email/send.json
//
// Когда не настроено — безопасный no-op (лог + { sent:false }), чтобы приложение
// работало до подключения почты. Docs: https://godocs.unisender.ru/web-api-ref

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type SendEmailResult = { sent: boolean; reason?: string; id?: string };

const DEFAULT_URL = "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json";

function parseFrom(s: string): { email: string; name?: string } {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2].trim() };
  return { email: s.trim() };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.UNISENDER_GO_API_KEY?.trim();
  const fromRaw = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !fromRaw) {
    console.warn(
      "[email] not configured (UNISENDER_GO_API_KEY / EMAIL_FROM missing) — skipping send",
    );
    return { sent: false, reason: "not_configured" };
  }

  const url = process.env.UNISENDER_GO_API_URL?.trim() || DEFAULT_URL;
  const from = parseFrom(fromRaw);
  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).map((email) => ({ email }));

  const message: Record<string, unknown> = {
    recipients,
    subject: input.subject,
    from_email: from.email,
    body: { plaintext: input.text, ...(input.html ? { html: input.html } : {}) },
    ...(from.name ? { from_name: from.name } : {}),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      job_id?: string;
      emails?: unknown[];
    };
    if (!res.ok || data?.status === "error") {
      console.error("[email] UniSender send failed", res.status, data);
      return { sent: false, reason: data?.message ?? `http_${res.status}` };
    }
    return { sent: true, id: data?.job_id };
  } catch (e) {
    console.error("[email] send error", e);
    return { sent: false, reason: "error" };
  }
}
