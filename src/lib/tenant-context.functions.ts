import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResolvedTenant = {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string | null;
};

export type MyTenantContext = {
  hasLink: boolean;
  email: string | null;
  tenants: ResolvedTenant[];
};

/**
 * Resolve which tenant rows (`public.tenants`) belong to the calling user.
 *
 * Linking model: an owner adds a real auth user as a tenant member via
 * `public.user_links(owner_user_id, member_user_id, role='tenant')`. The
 * member's account email is then matched to `tenants.email` rows owned by
 * each linked owner. Multiple matches are returned so the UI can show a
 * picker.
 *
 * Admin client is used only to read `tenants` rows the caller would not
 * otherwise see under RLS — the function still authorises the caller through
 * `requireSupabaseAuth` and only returns rows that match the caller's own
 * `user_links` membership AND email.
 */
export const getMyTenantContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyTenantContext> => {
    const email = ((context.claims as any)?.email ?? "").toString().toLowerCase() || null;

    const { data: links, error: linksErr } = await context.supabase
      .from("user_links")
      .select("owner_user_id")
      .eq("member_user_id", context.userId)
      .eq("role", "tenant");
    if (linksErr) throw new Error(linksErr.message);

    const ownerIds = Array.from(new Set((links ?? []).map((l: any) => l.owner_user_id as string)));
    if (ownerIds.length === 0) {
      return { hasLink: false, email, tenants: [] };
    }
    if (!email) {
      return { hasLink: true, email: null, tenants: [] };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenantRows, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, name, owner_id, email")
      .in("owner_id", ownerIds);
    if (tErr) throw new Error(tErr.message);

    const matched = (tenantRows ?? []).filter(
      (t: any) => (t.email ?? "").toString().toLowerCase() === email,
    );
    if (matched.length === 0) {
      return { hasLink: true, email, tenants: [] };
    }

    const ownerSet = Array.from(new Set(matched.map((t: any) => t.owner_id as string)));
    const nameById = new Map<string, string | null>();
    if (ownerSet.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", ownerSet);
      (profs ?? []).forEach((p: any) => nameById.set(p.id, p.full_name ?? null));
    }

    return {
      hasLink: true,
      email,
      tenants: matched.map((t: any) => ({
        id: t.id as string,
        name: t.name as string,
        owner_id: t.owner_id as string,
        owner_name: nameById.get(t.owner_id) ?? null,
      })),
    };
  });
