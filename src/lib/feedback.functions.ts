import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Where questions/feedback are delivered.
const FEEDBACK_TO = ["aidar.marchenko@gmail.com", "aidar.marchenko@mail.ru"];

const Input = z.object({ message: z.string().trim().min(3).max(5000) });

// Per-user rate limit so one account can't spam the developer inboxes through
// the paid email API. In-memory is enough: the app runs as a single container,
// and losing the counter on restart only re-opens a small window.
const FEEDBACK_WINDOW_MS = 10 * 60_000;
const FEEDBACK_MAX_PER_WINDOW = 5;
const feedbackWindows = new Map<string, { start: number; count: number }>();
function feedbackRateLimited(userId: string): boolean {
  const now = Date.now();
  const w = feedbackWindows.get(userId);
  if (!w || now - w.start >= FEEDBACK_WINDOW_MS) {
    // Opportunistic cleanup keeps the map from growing unboundedly.
    for (const [k, v] of feedbackWindows) {
      if (now - v.start >= FEEDBACK_WINDOW_MS) feedbackWindows.delete(k);
    }
    feedbackWindows.set(userId, { start: now, count: 1 });
    return false;
  }
  w.count += 1;
  return w.count > FEEDBACK_MAX_PER_WINDOW;
}

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    if (feedbackRateLimited(context.userId)) {
      throw new Error("Слишком много обращений подряд — подождите несколько минут.");
    }
    const email = ((context.claims as { email?: string })?.email ?? "").toString() || "неизвестно";
    const { sendEmail } = await import("@/lib/email.server");

    const subject = `LeasePlease · вопрос от ${email}`;
    const text = [
      "Новый вопрос / обратная связь из приложения LeasePlease.",
      "",
      `Аккаунт (email): ${email}`,
      `User ID: ${context.userId}`,
      "",
      "Сообщение:",
      data.message,
    ].join("\n");

    const result = await sendEmail({
      to: FEEDBACK_TO,
      subject,
      text,
      replyTo: email !== "неизвестно" ? email : undefined,
    });

    // Log server-side so feedback is never lost even if email isn't configured yet.
    if (!result.sent) {
      console.warn(
        `[feedback] email not delivered (${result.reason}). from=${email} userId=${context.userId} message=${JSON.stringify(
          data.message,
        )}`,
      );
    }

    return { ok: true, delivered: result.sent };
  });
