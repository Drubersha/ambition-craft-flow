import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminRole = "developer" | "moderator" | "owner";

async function getCallerRoles(supabase: any, userId: string): Promise<AdminRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role).filter((r: string) => r === "developer" || r === "moderator" || r === "owner");
}

export const getCurrentAdminRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getCallerRoles(context.supabase, context.userId);
    return { roles, userId: context.userId };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getCallerRoles(context.supabase, context.userId);
    if (roles.length === 0) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin.from("profiles").select("id, full_name");
    if (error) throw new Error(error.message);
    const { data: allRoles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string[]>();
    (allRoles ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email]));
    const lastSignByUser = new Map((authData?.users ?? []).map((u) => [u.id, u.last_sign_in_at]));
    const createdByUser = new Map((authData?.users ?? []).map((u) => [u.id, u.created_at]));
    return (profiles ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: emailById.get(p.id) ?? null,
      roles: rolesByUser.get(p.id) ?? [],
      last_sign_in_at: lastSignByUser.get(p.id) ?? null,
      created_at: createdByUser.get(p.id) ?? null,
    }));
  });

export const getUserOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const roles = await getCallerRoles(context.supabase, context.userId);
    if (roles.length === 0) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profile, userRoles, props, tenants, contracts, payments, tasks] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin.from("properties").select("id, name, status, area_total").eq("owner_id", data.userId),
      supabaseAdmin.from("tenants").select("id, name, phone, email").eq("owner_id", data.userId),
      supabaseAdmin.from("contracts").select("id, kind, status, start_date, end_date, monthly_amount").eq("owner_id", data.userId),
      supabaseAdmin.from("payments").select("id, amount, paid_at, charge_id").eq("owner_id", data.userId).order("paid_at", { ascending: false }).limit(50),
      supabaseAdmin.from("tasks").select("id, title, status, due_at").eq("owner_id", data.userId).order("created_at", { ascending: false }).limit(50),
    ]);
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    return {
      profile: profile.data,
      email: authUser?.user?.email ?? null,
      created_at: authUser?.user?.created_at ?? null,
      last_sign_in_at: authUser?.user?.last_sign_in_at ?? null,
      roles: (userRoles.data ?? []).map((r: any) => r.role),
      properties: props.data ?? [],
      tenants: tenants.data ?? [],
      contracts: contracts.data ?? [],
      payments: payments.data ?? [],
      tasks: tasks.data ?? [],
      viewerRoles: roles,
    };
  });

export const moderatorUpdateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; full_name?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const roles = await getCallerRoles(context.supabase, context.userId);
    if (!roles.includes("moderator") && !roles.includes("owner")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: data.userId,
      action: "moderator_action",
      entity_type: "profile",
      entity_id: data.userId,
      metadata: { changes: patch } as never,
    });
    return { ok: true };
  });

export const ownerSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: AdminRole | "manager"; grant: boolean }) => input)
  .handler(async ({ data, context }) => {
    const roles = await getCallerRoles(context.supabase, context.userId);
    if (!roles.includes("owner")) throw new Error("Only owner can manage roles");
    if (data.userId === context.userId && data.role === "owner" && !data.grant) {
      throw new Error("Owner cannot remove own owner role");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: data.role } as never, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
    }
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: data.userId,
      action: "moderator_action",
      entity_type: "user_role",
      entity_id: data.userId,
      metadata: { role: data.role, grant: data.grant } as never,
    });
    return { ok: true };
  });