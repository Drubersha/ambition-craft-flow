import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ tenantId: z.string().uuid() });

export const ensureChatThreadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = data;
    const { userId, claims, supabase } = context;
    const callerEmail = (claims?.email as string | undefined)?.toLowerCase() ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, owner_id, email")
      .eq("id", tenantId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!tenant) throw new Error("Tenant not found");

    let role: "owner" | "manager" | "tenant" | null = null;
    if (tenant.owner_id === userId) {
      role = "owner";
    } else {
      const { data: isMgr } = await supabase.rpc("is_linked_member", {
        _owner: tenant.owner_id,
        _member: userId,
        _role: "manager",
      });
      if (isMgr === true) {
        role = "manager";
      } else {
        const { data: isTenant } = await supabase.rpc("is_linked_member", {
          _owner: tenant.owner_id,
          _member: userId,
          _role: "tenant",
        });
        if (
          isTenant === true &&
          callerEmail &&
          tenant.email &&
          tenant.email.toLowerCase() === callerEmail
        ) {
          role = "tenant";
        }
      }
    }

    if (!role) throw new Error("Forbidden");

    const { data: existing } = await supabaseAdmin
      .from("chat_threads")
      .select("id, owner_id, tenant_id")
      .eq("owner_id", tenant.owner_id)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (existing) {
      return { threadId: existing.id, ownerId: existing.owner_id, role };
    }
    const { data: created, error: cErr } = await supabaseAdmin
      .from("chat_threads")
      .insert({ owner_id: tenant.owner_id, tenant_id: tenant.id })
      .select("id, owner_id")
      .single();
    if (cErr) throw new Error(cErr.message);
    return { threadId: created.id, ownerId: created.owner_id, role };
  });
