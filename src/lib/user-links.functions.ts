import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LinkRole = "manager" | "tenant";

async function getCallerRoles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role);
}

function isAdminRoles(roles: string[]) {
  return roles.includes("owner") || roles.includes("moderator") || roles.includes("developer");
}

async function findUserIdByEmail(supabaseAdmin: any, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  // listUsers is paginated; we scan reasonable pages.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u: any) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}

export const listMyLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: links, error } = await supabaseAdmin
      .from("user_links")
      .select("id, owner_user_id, member_user_id, role, created_at")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((links ?? []).map((l: any) => l.member_user_id)));
    const profilesById = new Map<string, { full_name: string | null; email: string | null }>();
    if (ids.length > 0) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      (profs ?? []).forEach((p: any) => profilesById.set(p.id, { full_name: p.full_name, email: null }));
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      (authData?.users ?? []).forEach((u: any) => {
        if (profilesById.has(u.id)) profilesById.get(u.id)!.email = u.email ?? null;
      });
    }
    return (links ?? []).map((l: any) => ({
      ...l,
      member_full_name: profilesById.get(l.member_user_id)?.full_name ?? null,
      member_email: profilesById.get(l.member_user_id)?.email ?? null,
    }));
  });

export const linkUserByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; role: LinkRole }) => input)
  .handler(async ({ data, context }) => {
    if (data.role !== "manager" && data.role !== "tenant") throw new Error("Неверная роль");
    const roles = await getCallerRoles(context.supabase, context.userId);
    if (!roles.includes("owner") && !isAdminRoles(roles)) {
      throw new Error("Доступно только арендодателю");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const memberId = await findUserIdByEmail(supabaseAdmin, data.email);
    if (!memberId) throw new Error("Пользователь с такой почтой не зарегистрирован");
    if (memberId === context.userId) throw new Error("Нельзя привязать самого себя");

    const { error: linkErr } = await supabaseAdmin.from("user_links").upsert(
      { owner_user_id: context.userId, member_user_id: memberId, role: data.role, created_by: context.userId } as never,
      { onConflict: "owner_user_id,member_user_id,role" },
    );
    if (linkErr) throw new Error(linkErr.message);
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: memberId, role: data.role } as never,
      { onConflict: "user_id,role" },
    );
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: memberId,
      action: "create",
      entity_type: "user_link",
      entity_id: memberId,
      metadata: { owner_user_id: context.userId, member_user_id: memberId, role: data.role } as never,
    });
    return { ok: true, memberId };
  });

export const unlinkUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { linkId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin.from("user_links").select("*").eq("id", data.linkId).maybeSingle();
    if (!link) throw new Error("Связь не найдена");
    const roles = await getCallerRoles(context.supabase, context.userId);
    if (link.owner_user_id !== context.userId && !isAdminRoles(roles)) {
      throw new Error("Нет прав");
    }
    const { error } = await supabaseAdmin.from("user_links").delete().eq("id", data.linkId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: link.member_user_id,
      action: "delete",
      entity_type: "user_link",
      entity_id: link.member_user_id,
      metadata: link as never,
    });
    return { ok: true };
  });

export const moderatorLinkUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ownerUserId: string; memberUserId: string; role: LinkRole }) => input)
  .handler(async ({ data, context }) => {
    if (data.role !== "manager" && data.role !== "tenant") throw new Error("Неверная роль");
    const roles = await getCallerRoles(context.supabase, context.userId);
    if (!isAdminRoles(roles)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_links").upsert(
      { owner_user_id: data.ownerUserId, member_user_id: data.memberUserId, role: data.role, created_by: context.userId } as never,
      { onConflict: "owner_user_id,member_user_id,role" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: data.memberUserId, role: data.role } as never,
      { onConflict: "user_id,role" },
    );
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      acted_as_user_id: data.memberUserId,
      action: "moderator_action",
      entity_type: "user_link",
      entity_id: data.memberUserId,
      metadata: { ...data } as never,
    });
    return { ok: true };
  });

export const listLinksForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const roles = await getCallerRoles(context.supabase, context.userId);
    if (!isAdminRoles(roles)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: asMember } = await supabaseAdmin
      .from("user_links")
      .select("id, owner_user_id, member_user_id, role, created_at")
      .eq("member_user_id", data.userId);
    const { data: asOwner } = await supabaseAdmin
      .from("user_links")
      .select("id, owner_user_id, member_user_id, role, created_at")
      .eq("owner_user_id", data.userId);
    const ids = Array.from(new Set([
      ...(asMember ?? []).map((l: any) => l.owner_user_id),
      ...(asOwner ?? []).map((l: any) => l.member_user_id),
    ]));
    const nameById = new Map<string, string | null>();
    const emailById = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      (profs ?? []).forEach((p: any) => nameById.set(p.id, p.full_name));
      const { data: auths } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      (auths?.users ?? []).forEach((u: any) => { if (ids.includes(u.id)) emailById.set(u.id, u.email ?? null); });
    }
    const decorate = (l: any, otherId: string) => ({
      ...l,
      other_user_id: otherId,
      other_full_name: nameById.get(otherId) ?? null,
      other_email: emailById.get(otherId) ?? null,
    });
    return {
      asMember: (asMember ?? []).map((l: any) => decorate(l, l.owner_user_id)),
      asOwner: (asOwner ?? []).map((l: any) => decorate(l, l.member_user_id)),
    };
  });