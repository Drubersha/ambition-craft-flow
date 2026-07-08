import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";

// Legacy webhook kept for backward compatibility: older databases still have a
// pg_net trigger that POSTs here on every notification insert. Emails are now
// sent as digests by the in-app scheduler (src/lib/notification-digest.server.ts),
// so this endpoint only makes sure the scheduler is running and acknowledges.

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/notify-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.NOTIFY_WEBHOOK_SECRET?.trim();
        if (expected && !secretMatches(request.headers.get("x-webhook-secret"), expected)) {
          return new Response(JSON.stringify({ ok: false, reason: "forbidden" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const { ensureNotificationDigestScheduler } =
          await import("@/lib/notification-digest.server");
        ensureNotificationDigestScheduler();
        return new Response(JSON.stringify({ ok: true, queued: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
