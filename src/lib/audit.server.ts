/**
 * Server-only аудит админ-действий в `activity_logs`.
 *
 * Import only from `.server.ts` / inside server-function handlers — never
 * from a route or component module-scope.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminAuditEntry = {
  /** context.userId — кто действовал. */
  userId: string;
  /** Затронутый пользователь. */
  actedAs: string;
  action: "create" | "delete" | "moderator_action";
  entityType: "profile" | "user_role" | "user" | "user_link";
  entityId: string;
  metadata?: Record<string, unknown>;
};

/** Fire-and-forget аудит админ-действий. Никогда не бросает (supabase-js возвращает { error }). */
export async function logAdminAction(
  sb: SupabaseClient<Database>,
  entry: AdminAuditEntry,
): Promise<void> {
  const { error } = await sb.from("activity_logs").insert({
    user_id: entry.userId,
    acted_as_user_id: entry.actedAs,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    metadata: (entry.metadata ?? {}) as never,
  });
  if (error) console.error("[audit] activity_logs insert failed:", error.message);
}
