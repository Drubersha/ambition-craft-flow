import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminRoles, requireAdministrator, type AdminRole } from "@/lib/auth-roles.server";

export type { AdminRole } from "@/lib/auth-roles.server";

export const getCurrentAdminRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getAdminRoles(context.supabase, context.userId);
    return { roles, userId: context.userId };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getAdminRoles(context.supabase, context.userId);
    requireAdministrator(roles);
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
    const { listAllAuthUsersPaginated } = await import("@/lib/auth-users.server");
    const authUsers = await listAllAuthUsersPaginated(supabaseAdmin);
    const emailById = new Map(authUsers.map((u) => [u.id, u.email]));
    const lastSignByUser = new Map(authUsers.map((u) => [u.id, u.last_sign_in_at]));
    const createdByUser = new Map(authUsers.map((u) => [u.id, u.created_at]));
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
    const roles = await getAdminRoles(context.supabase, context.userId);
    requireAdministrator(roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profile, userRoles, props, tenants, contracts, payments, tasks] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin
        .from("properties")
        .select("id, name, status, area_total")
        .eq("owner_id", data.userId),
      supabaseAdmin.from("tenants").select("id, name, phone, email").eq("owner_id", data.userId),
      supabaseAdmin
        .from("contracts")
        .select(
          "id, number, kind, status, start_date, end_date, rate, area, payment_period, currency",
        )
        .eq("owner_id", data.userId),
      supabaseAdmin
        .from("payments")
        .select("id, amount, paid_at, charge_id")
        .eq("owner_id", data.userId)
        .order("paid_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("tasks")
        .select("id, title, status, priority, created_at")
        .eq("owner_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
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
    const roles = await getAdminRoles(context.supabase, context.userId);
    requireAdministrator(roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", data.userId);
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
    const roles = await getAdminRoles(context.supabase, context.userId);
    if (!roles.includes("developer")) throw new Error("Only developer can manage roles");
    if (data.userId === context.userId && data.role === "developer" && !data.grant) {
      throw new Error("Developer cannot remove own developer role");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role } as never, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
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

export type CreatableRole = "owner" | "tenant" | "manager" | "moderator" | "developer";

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { email: string; password: string; fullName?: string; role: CreatableRole }) => input,
  )
  .handler(async ({ data, context }) => {
    const roles = await getAdminRoles(context.supabase, context.userId);
    requireAdministrator(roles);
    const email = data.email.trim().toLowerCase();
    if (!email || !data.password || data.password.length < 8)
      throw new Error("Email и пароль (≥8 символов) обязательны");
    const baseRole: "owner" | "tenant" = data.role === "tenant" ? "tenant" : "owner";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName ?? email, signup_role: baseRole },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Не удалось создать пользователя");
    if (data.role !== baseRole) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: newId, role: data.role } as never, { onConflict: "user_id,role" });
    }
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: newId,
      action: "create",
      entity_type: "user",
      entity_id: newId,
      metadata: { email, role: data.role } as never,
    });
    return { ok: true, userId: newId };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const roles = await getAdminRoles(context.supabase, context.userId);
    requireAdministrator(roles);
    if (data.userId === context.userId) throw new Error("Нельзя удалить свой аккаунт");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: data.userId,
      action: "delete",
      entity_type: "user",
      entity_id: data.userId,
      metadata: {} as never,
    });
    return { ok: true };
  });

export const adminAddTenantRoleAndLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { memberUserId: string; ownerUserId: string }) => input)
  .handler(async ({ data, context }) => {
    const roles = await getAdminRoles(context.supabase, context.userId);
    requireAdministrator(roles);
    if (data.memberUserId === data.ownerUserId) throw new Error("Нельзя привязать к самому себе");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.memberUserId, role: "tenant" } as never, {
        onConflict: "user_id,role",
      });
    const { error } = await supabaseAdmin.from("user_links").upsert(
      {
        owner_user_id: data.ownerUserId,
        member_user_id: data.memberUserId,
        role: "tenant",
        created_by: context.userId,
      } as never,
      { onConflict: "owner_user_id,member_user_id,role" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: data.memberUserId,
      action: "moderator_action",
      entity_type: "user_link",
      entity_id: data.memberUserId,
      metadata: { owner_user_id: data.ownerUserId, role: "tenant", added_role: true } as never,
    });
    return { ok: true };
  });

export const adminCreateCompanionAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { sourceUserId: string; email: string; password: string; fullName?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const roles = await getAdminRoles(context.supabase, context.userId);
    requireAdministrator(roles);
    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Email обязателен");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: srcRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.sourceUserId);
    const existing = new Set((srcRoles ?? []).map((r: any) => r.role));
    const hasOwner = existing.has("owner");
    const hasTenant = existing.has("tenant");
    if (hasOwner && hasTenant)
      throw new Error("У пользователя уже есть и арендодатель, и арендатор");
    const newRole: "owner" | "tenant" = hasOwner ? "tenant" : "owner";

    // Same email as source → just grant the missing role to the existing auth user (no new account).
    const { data: srcAuth } = await supabaseAdmin.auth.admin.getUserById(data.sourceUserId);
    const srcEmail = (srcAuth?.user?.email ?? "").toLowerCase();
    if (srcEmail && email === srcEmail) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.sourceUserId, role: newRole } as never, {
          onConflict: "user_id,role",
        });
      await supabaseAdmin.from("activity_logs").insert({
        user_id: context.userId,
        acted_as_user_id: data.sourceUserId,
        action: "moderator_action",
        entity_type: "user_role",
        entity_id: data.sourceUserId,
        metadata: { role: newRole, grant: true, companion_same_email: true } as never,
      });
      return { ok: true, userId: data.sourceUserId, role: newRole, sameAccount: true };
    }

    if (!data.password || data.password.length < 8)
      throw new Error("Пароль ≥8 символов обязателен");
    const { data: srcProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", data.sourceUserId)
      .maybeSingle();
    const fullName = data.fullName?.trim() || srcProfile?.full_name || email;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, signup_role: newRole },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Не удалось создать аккаунт");
    const ownerId = newRole === "owner" ? newId : data.sourceUserId;
    const memberId = newRole === "tenant" ? newId : data.sourceUserId;
    await supabaseAdmin.from("user_links").upsert(
      {
        owner_user_id: ownerId,
        member_user_id: memberId,
        role: "tenant",
        created_by: context.userId,
      } as never,
      { onConflict: "owner_user_id,member_user_id,role" },
    );
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: newId,
      action: "create",
      entity_type: "user",
      entity_id: newId,
      metadata: { companion_of: data.sourceUserId, role: newRole, email } as never,
    });
    return { ok: true, userId: newId, role: newRole, sameAccount: false };
  });
