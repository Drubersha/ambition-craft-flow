import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Bcrypt (used by GoTrue) silently truncates at 72 bytes — cap there.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < PASSWORD_MIN) issues.push(`минимум ${PASSWORD_MIN} символов`);
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(pw)) issues.push("хотя бы одна буква");
  if (!/\d/.test(pw)) issues.push("хотя бы одна цифра");
  return issues;
}

const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: z
    .string()
    .max(PASSWORD_MAX)
    .refine((pw) => passwordIssues(pw).length === 0, {
      message: "Пароль слишком простой",
    }),
});

// Verifying the current password is a sign-in attempt: rate-limit it per user
// so a stolen session can't brute-force the password through this endpoint.
// In-memory is enough — the app runs as a single container.
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const attemptWindows = new Map<string, { start: number; count: number }>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const w = attemptWindows.get(userId);
  if (!w || now - w.start >= WINDOW_MS) {
    for (const [k, v] of attemptWindows) {
      if (now - v.start >= WINDOW_MS) attemptWindows.delete(k);
    }
    attemptWindows.set(userId, { start: now, count: 1 });
    return false;
  }
  w.count += 1;
  return w.count > MAX_ATTEMPTS_PER_WINDOW;
}

/**
 * Change the signed-in user's password.
 * Best practices applied:
 *  - re-authentication: the current password is verified server-side first;
 *  - per-user rate limit so the endpoint can't be used to brute-force;
 *  - the new password must differ from the current one;
 *  - an email notification is sent to the account owner after the change
 *    (skipped for internal `.local` demo accounts).
 */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChangePasswordInput.parse(d))
  .handler(async ({ data, context }) => {
    const email = ((context.claims as { email?: string })?.email ?? "").toString().toLowerCase();
    if (!email) throw new Error("У аккаунта нет email — смена пароля недоступна.");
    if (email.endsWith(".local")) {
      throw new Error("Пароль демо-аккаунта изменить нельзя.");
    }
    if (rateLimited(context.userId)) {
      throw new Error("Слишком много попыток — попробуйте через 15 минут.");
    }
    if (data.newPassword === data.currentPassword) {
      throw new Error("Новый пароль должен отличаться от текущего.");
    }

    // Re-authenticate: prove the caller knows the current password, not just
    // holds a live session token.
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: signIn, error: signInError } = await verifier.auth.signInWithPassword({
      email,
      password: data.currentPassword,
    });
    if (signInError || signIn.user?.id !== context.userId) {
      throw new Error("Текущий пароль неверен.");
    }

    // Update the password AS THE CALLER'S OWN SESSION (not via the admin API):
    // GoTrue invalidates every session on an admin password reset, which would
    // log the user out of the very browser they changed the password in. A
    // user-scoped update keeps the calling session alive.
    const { getRequest } = await import("@tanstack/react-start/server");
    const authHeader = getRequest()?.headers.get("authorization") ?? "";
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: data.newPassword }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[account] password update failed", res.status, body);
      throw new Error("Не удалось изменить пароль. Попробуйте позже.");
    }

    // In-app notification (deep-links to account settings). The dedicated
    // security email below carries the details, so the generic notification
    // email pipeline skips kind='account' rows. Best effort.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
      user_id: context.userId,
      kind: "account",
      title: "Пароль изменён",
      body: "Пароль вашего аккаунта был изменён. Если это были не вы — срочно смените пароль в настройках.",
      route: "/settings",
    });
    if (notifyError) console.warn("[account] in-app notification failed", notifyError);

    // Security notification — best effort, must not fail the change itself.
    const { sendEmail } = await import("@/lib/email.server");
    const when = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    const result = await sendEmail({
      to: email,
      subject: "LeasePlease · пароль вашего аккаунта изменён",
      text: [
        "Здравствуйте!",
        "",
        `Пароль вашего аккаунта LeasePlease (${email}) был изменён ${when} (МСК).`,
        "",
        "Если это были вы — ничего делать не нужно.",
        "Если вы НЕ меняли пароль, немедленно восстановите доступ: войдите в приложение,",
        "смените пароль в настройках аккаунта и напишите в поддержку через раздел «FAQ и помощь».",
      ].join("\n"),
    });
    if (!result.sent) {
      console.warn(`[account] password-change email not delivered (${result.reason}) to=${email}`);
    }

    return { ok: true, notified: result.sent };
  });
