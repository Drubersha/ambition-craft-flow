import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";

// Internal webhook called by the DB (pg_net) after a notification row is inserted.
// It resolves the recipient's account email and sends the notification by email.
// Auth: shared secret in the `x-webhook-secret` header (must match NOTIFY_WEBHOOK_SECRET).

// Constant-time comparison (via fixed-length digests) so the public endpoint
// doesn't leak how many leading characters of the secret matched.
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Cap outbound sends so a leaked/guessed secret can't turn this endpoint into an
// email cannon (sender-reputation / provider-cost abuse). In-memory fixed window
// is enough: the app runs as a single container.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 120;
let rateWindowStart = 0;
let rateCount = 0;
function rateLimited(): boolean {
  const now = Date.now();
  if (now - rateWindowStart >= RATE_WINDOW_MS) {
    rateWindowStart = now;
    rateCount = 0;
  }
  rateCount += 1;
  return rateCount > RATE_MAX_PER_WINDOW;
}

// Deep links in emails must be public URLs. This handler is always invoked on the
// internal Docker address (http://app:3000) by the pg_net webhook, so we never fall
// back to the request origin — only SITE_URL yields a browser-openable link.
function siteBase(): string {
  const fromEnv = process.env.SITE_URL?.trim();
  return fromEnv ? fromEnv.replace(/\/+$/, "") : "";
}

// Skip clearly non-deliverable/internal accounts (demo & test fixtures) so we
// never send to fake addresses or hurt sender reputation with bounces.
function isDeliverable(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@")) return false;
  if (e.endsWith(".local")) return false;
  return true;
}

export const Route = createFileRoute("/api/notify-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.NOTIFY_WEBHOOK_SECRET?.trim();
        if (!expected) {
          console.warn("[notify-email] NOTIFY_WEBHOOK_SECRET not set — skipping");
          return new Response(JSON.stringify({ ok: false, reason: "not_configured" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (!secretMatches(request.headers.get("x-webhook-secret"), expected)) {
          return new Response(JSON.stringify({ ok: false, reason: "forbidden" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        // After auth so unauthenticated noise can't starve legit deliveries.
        if (rateLimited()) {
          console.warn("[notify-email] rate limit exceeded — dropping request");
          return new Response(JSON.stringify({ ok: false, reason: "rate_limited" }), {
            status: 429,
            headers: { "content-type": "application/json" },
          });
        }

        let notificationId: string | undefined;
        try {
          const body = (await request.json()) as { notification_id?: string };
          notificationId = body?.notification_id;
        } catch {
          /* fall through to bad_request */
        }
        if (!notificationId) {
          return new Response(JSON.stringify({ ok: false, reason: "bad_request" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: n, error } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id, kind, title, body, route")
          .eq("id", notificationId)
          .maybeSingle();
        if (error || !n) {
          return new Response(JSON.stringify({ ok: false, reason: "not_found" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(n.user_id);
        const email = userRes?.user?.email ?? "";
        if (!isDeliverable(email)) {
          return new Response(JSON.stringify({ ok: true, delivered: false, reason: "no_email" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        // Only build an absolute link when SITE_URL is configured; otherwise omit it
        // rather than ship a non-openable internal URL.
        const base = siteBase();
        const link = base ? `${base}${n.route ?? ""}` : "";
        const subject = `LeasePlease · ${n.title}`;
        const textLines = [
          n.title,
          ...(n.body ? ["", n.body] : []),
          ...(link ? ["", `Открыть в приложении: ${link}`] : []),
          "",
          "— LeasePlease",
        ];
        const html = [
          `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;color:#111">`,
          `<h2 style="margin:0 0 8px">${escapeHtml(n.title)}</h2>`,
          n.body ? `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(n.body)}</p>` : "",
          link
            ? `<p style="margin:0 0 16px"><a href="${escapeHtml(link)}" style="color:#4f46e5">Открыть в приложении</a></p>`
            : "",
          `<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>`,
          `<p style="margin:0;color:#666;font-size:13px">Вы получили это письмо, потому что у вас есть аккаунт в LeasePlease.</p>`,
          `</div>`,
        ].join("");

        const { sendEmail } = await import("@/lib/email.server");
        const result = await sendEmail({
          to: email,
          subject,
          text: textLines.join("\n"),
          html,
        });

        if (!result.sent) {
          console.warn(
            `[notify-email] not delivered (${result.reason}) notification=${n.id} to=${email}`,
          );
        }

        return new Response(JSON.stringify({ ok: true, delivered: result.sent }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
