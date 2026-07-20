import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserRoles, isAdministrator } from "@/lib/auth-roles.server";

export type LinkedOwner = {
  owner_user_id: string;
  owner_full_name: string | null;
  owner_email: string | null;
};

export type MyManagerContext = {
  /** True when the caller has at least one `role='manager'` row in `user_links`. */
  isManager: boolean;
  /** Owners the caller is linked to as a manager. */
  owners: LinkedOwner[];
};

/**
 * Resolve which owners the calling user can act on behalf of as a manager.
 *
 * Source of truth: `public.user_links(member_user_id = auth.uid(),
 * role = 'manager')`. The caller does NOT need the `manager` row in
 * `user_roles` — membership in `user_links` is what unlocks the linked
 * manager RLS policies (`is_linked_member(...)`).
 */
export const getMyManagerContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyManagerContext> => {
    const { data: links, error } = await context.supabase
      .from("user_links")
      .select("owner_user_id")
      .eq("member_user_id", context.userId)
      .eq("role", "manager");
    if (error) throw new Error(error.message);
    const ownerIds = Array.from(new Set((links ?? []).map((l: any) => l.owner_user_id as string)));
    if (ownerIds.length === 0) return { isManager: false, owners: [] };

    // Admin client only to read owner display fields the caller would not
    // otherwise see under RLS. We restrict to ids the caller is already
    // linked to, so no cross-tenant leakage.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);
    const nameById = new Map<string, string | null>();
    (profs ?? []).forEach((p: any) => nameById.set(p.id, p.full_name ?? null));
    const { getAuthUsersByIds } = await import("@/lib/auth-users.server");
    const authById = await getAuthUsersByIds(supabaseAdmin, ownerIds);

    return {
      isManager: true,
      owners: ownerIds.map((id) => ({
        owner_user_id: id,
        owner_full_name: nameById.get(id) ?? null,
        owner_email: authById.get(id)?.email ?? null,
      })),
    };
  });

/**
 * Authorise that the caller can act on data scoped to `ownerId`.
 * Allowed when caller IS the owner, has `manager` link to that owner, or is
 * a moderator/developer admin. Throws otherwise.
 *
 * Use this in privileged (service-role) server functions before touching
 * data belonging to `ownerId` — RLS does not apply through `supabaseAdmin`.
 */
export const assertOwnerAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ownerId: string }) => input)
  .handler(async ({ data, context }) => {
    return await ensureOwnerAccess(context.supabase, context.userId, data.ownerId);
  });

/** Helper for in-process use from other server functions. */
export async function ensureOwnerAccess(
  supabase: any,
  callerUserId: string,
  ownerId: string,
): Promise<{ ok: true; role: "owner" | "manager" | "admin" }> {
  if (callerUserId === ownerId) return { ok: true, role: "owner" };
  const [roles, { data: link }] = await Promise.all([
    getUserRoles(supabase, callerUserId),
    supabase
      .from("user_links")
      .select("id")
      .eq("owner_user_id", ownerId)
      .eq("member_user_id", callerUserId)
      .eq("role", "manager")
      .maybeSingle(),
  ]);
  if (isAdministrator(roles)) return { ok: true, role: "admin" };
  if (link) return { ok: true, role: "manager" };
  throw new Error("Нет прав на этого арендодателя");
}
