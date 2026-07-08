import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // The notifications bell polls this for every active user — a reliable
    // place to lazily start the email digest scheduler after (re)starts.
    const { ensureNotificationDigestScheduler } = await import("@/lib/notification-digest.server");
    ensureNotificationDigestScheduler();
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, kind, title, body, entity_table, entity_id, route, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids?: string[]; all?: boolean }) => input)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (!data.all && data.ids && data.ids.length) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids?: string[]; all?: boolean }) => input)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("notifications").delete().eq("user_id", context.userId);
    if (!data.all && data.ids && data.ids.length) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
