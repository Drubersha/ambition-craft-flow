import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LogInput = {
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  acted_as_user_id?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown>;
};

export const logActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LogInput) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: data.acted_as_user_id ?? null,
      action: data.action,
      entity_type: data.entity_type ?? null,
      entity_id: data.entity_id ?? null,
      route: data.route ?? null,
      metadata: (data.metadata ?? {}) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ActivityLogFilters = {
  user_id?: string | null;
  action?: string | null;
  entity_type?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
};

export const getActivityLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ActivityLogFilters) => input ?? {})
  .handler(async ({ data, context }) => {
    const limit = Math.min(Math.max(data.limit ?? 50, 1), 200);
    const offset = Math.max(data.offset ?? 0, 0);
    let q = context.supabase
      .from("activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    if (data.action) q = q.eq("action", data.action);
    if (data.entity_type) q = q.eq("entity_type", data.entity_type);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.search) {
      // Sanitize: strip PostgREST filter metacharacters to prevent filter injection.
      const safe = data.search.replace(/[^a-zA-Z0-9_ /.\-А-Яа-яЁё]/g, "").slice(0, 100);
      if (safe) {
        const pattern = `%${safe}%`;
        q = q.or(
          [
            `route.ilike.${pattern}`,
            `action.ilike.${pattern}`,
            `entity_type.ilike.${pattern}`,
          ].join(","),
        );
      }
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    // Enrich with profile names
    const ids = Array.from(
      new Set(
        (rows ?? []).flatMap((r) => [r.user_id, r.acted_as_user_id].filter(Boolean) as string[]),
      ),
    );
    const profiles = ids.length
      ? ((await context.supabase.from("profiles").select("id, full_name").in("id", ids)).data ?? [])
      : [];
    const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));
    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        user_name: r.user_id ? (nameById.get(r.user_id) ?? null) : null,
        acted_as_name: r.acted_as_user_id ? (nameById.get(r.acted_as_user_id) ?? null) : null,
      })),
      total: count ?? 0,
    };
  });
