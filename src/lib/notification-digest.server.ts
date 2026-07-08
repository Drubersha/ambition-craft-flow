// Digest delivery of in-app notifications by email.
//
// Instead of one email per notification (painful during mass data entry),
// pending notifications (emailed_at IS NULL) are flushed on a schedule:
//   - kind='account'  — never handled here: the app sends those immediately
//                       (e.g. password change) and stamps emailed_at itself;
//   - kind='chat'     — one digest per user every 30 minutes;
//   - everything else — one digest per user every 2 hours.
//
// The scheduler is an in-process interval (the app runs as a single
// container). It is started lazily from hot server paths; after a restart the
// first catch-up run happens within a minute, so pending rows are never lost —
// they simply wait in the notifications table.

export type PendingNotification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  route: string | null;
  created_at: string;
};

const MIN_30 = 30 * 60_000;
const HOURS_2 = 2 * 60 * 60_000;

function intervalMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : fallback;
}

/** Windows are env-overridable (useful in tests/staging). */
export function chatIntervalMs() {
  return intervalMs("NOTIFY_DIGEST_CHAT_MS", MIN_30);
}
export function otherIntervalMs() {
  return intervalMs("NOTIFY_DIGEST_OTHER_MS", HOURS_2);
}

// Deep links in emails must be public URLs; only SITE_URL yields those.
function siteBase(): string {
  const fromEnv = process.env.SITE_URL?.trim();
  return fromEnv ? fromEnv.replace(/\/+$/, "") : "";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isDeliverable(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@")) return false;
  if (e.endsWith(".local")) return false;
  return true;
}

export function groupByUser(items: PendingNotification[]): Map<string, PendingNotification[]> {
  const map = new Map<string, PendingNotification[]>();
  for (const n of items) {
    const arr = map.get(n.user_id) ?? [];
    arr.push(n);
    map.set(n.user_id, arr);
  }
  return map;
}

/** One email covering every pending notification of a user. */
export function buildDigestEmail(items: PendingNotification[]): {
  subject: string;
  text: string;
  html: string;
} {
  const base = siteBase();
  const single = items.length === 1;
  const subject = single
    ? `LeasePlease · ${items[0].title}`
    : `LeasePlease · новые уведомления (${items.length})`;

  const textLines: string[] = single ? [] : [`У вас ${items.length} новых уведомлений:`, ""];
  const htmlItems: string[] = [];
  for (const n of items) {
    const link = base && n.route ? `${base}${n.route}` : "";
    textLines.push(n.title + (n.body ? ` — ${n.body}` : ""));
    if (link) textLines.push(`Открыть: ${link}`);
    textLines.push("");
    htmlItems.push(
      `<li style="margin:0 0 12px">` +
        `<div style="font-weight:600">${escapeHtml(n.title)}</div>` +
        (n.body ? `<div style="white-space:pre-wrap;color:#333">${escapeHtml(n.body)}</div>` : "") +
        (link
          ? `<div><a href="${escapeHtml(link)}" style="color:#4f46e5">Открыть в приложении</a></div>`
          : "") +
        `</li>`,
    );
  }
  textLines.push("— LeasePlease");

  const html = [
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;color:#111">`,
    single
      ? `<h2 style="margin:0 0 8px">${escapeHtml(items[0].title)}</h2>`
      : `<h2 style="margin:0 0 8px">Новые уведомления (${items.length})</h2>`,
    `<ul style="list-style:none;margin:0 0 16px;padding:0">${htmlItems.join("")}</ul>`,
    `<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>`,
    `<p style="margin:0;color:#666;font-size:13px">Вы получили это письмо, потому что у вас есть аккаунт в LeasePlease.</p>`,
    `</div>`,
  ].join("");

  return { subject, text: textLines.join("\n"), html };
}

const FLUSH_LIMIT = 500;

/**
 * Send digests for one category and stamp emailed_at.
 * `olderThanMs` restricts the catch-up run after a restart so fresh rows keep
 * waiting their full window instead of going out immediately.
 */
export async function flushDigest(
  category: "chat" | "other",
  olderThanMs = 0,
): Promise<{ sent: number; skipped: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let q = supabaseAdmin
    .from("notifications")
    .select("id, user_id, kind, title, body, route, created_at")
    .is("emailed_at", null)
    .order("created_at", { ascending: true })
    .limit(FLUSH_LIMIT);
  q = category === "chat" ? q.eq("kind", "chat") : q.not("kind", "in", '("chat","account")');
  if (olderThanMs > 0) {
    q = q.lt("created_at", new Date(Date.now() - olderThanMs).toISOString());
  }
  const { data, error } = await q;
  if (error) {
    // Most likely the emailed_at migration is not applied yet.
    console.error(`[notify-digest] pending query failed (${category}):`, error.message);
    return { sent: 0, skipped: 0 };
  }
  const pending = (data ?? []) as PendingNotification[];
  if (pending.length === 0) return { sent: 0, skipped: 0 };

  const { sendEmail } = await import("@/lib/email.server");
  const byUser = groupByUser(pending);
  let sent = 0;
  let skipped = 0;

  for (const [userId, items] of byUser) {
    const ids = items.map((n) => n.id);
    // Stamp BEFORE sending: if stamping is broken (e.g. stale PostgREST schema
    // cache right after the migration) we must not re-send the same digest
    // every cycle — a lost email is recoverable in-app, spam is not.
    const stamped = await stampEmailed(supabaseAdmin, ids);
    if (!stamped) continue;

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userRes?.user?.email ?? "";
    if (!isDeliverable(email)) {
      // Demo/internal accounts: nothing to deliver.
      skipped += items.length;
      continue;
    }

    const msg = buildDigestEmail(items);
    const result = await sendEmail({ to: email, ...msg });
    if (result.sent) sent += items.length;
    else {
      skipped += items.length;
      console.warn(`[notify-digest] send failed (${result.reason}) user=${userId} n=${ids.length}`);
    }
  }
  if (sent > 0 || skipped > 0) {
    console.log(`[notify-digest] ${category}: emailed ${sent}, skipped ${skipped}`);
  }
  return { sent, skipped };
}

async function stampEmailed(supabaseAdmin: any, ids: string[]): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) console.error("[notify-digest] failed to stamp emailed_at:", error.message);
  return !error;
}

let started = false;

/** Idempotent; call from any hot server path. */
export function ensureNotificationDigestScheduler(): void {
  if (started || typeof setInterval === "undefined") return;
  started = true;
  const chatMs = chatIntervalMs();
  const otherMs = otherIntervalMs();
  // Catch-up shortly after (re)start: deliver only rows that already waited
  // out their window, e.g. across a deploy restart.
  setTimeout(() => void flushDigest("chat", chatMs), 60_000);
  setTimeout(() => void flushDigest("other", otherMs), 90_000);
  setInterval(() => void flushDigest("chat"), chatMs);
  setInterval(() => void flushDigest("other"), otherMs);
  console.log(
    `[notify-digest] scheduler started (chat every ${Math.round(chatMs / 60000)} min, ` +
      `other every ${Math.round(otherMs / 60000)} min)`,
  );
}
