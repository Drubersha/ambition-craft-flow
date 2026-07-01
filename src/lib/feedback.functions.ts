import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Where questions/feedback are delivered.
const FEEDBACK_TO = ["aidar.marchenko@gmail.com", "aidar.marchenko@mail.ru"];

const Input = z.object({ message: z.string().trim().min(3).max(5000) });

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
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
