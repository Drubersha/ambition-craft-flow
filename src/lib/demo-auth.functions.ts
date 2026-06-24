import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DemoKind = "demo" | "demo2" | "moderator" | "developer";

export const DEMO_ACCOUNTS: Record<DemoKind, { email: string; password: string; full_name: string; roles: string[] }> = {
  demo: { email: "demo@rentflow.local", password: "demo-rentflow-2024", full_name: "Демо-арендодатель", roles: ["owner"] },
  demo2: { email: "demo2@rentflow.local", password: "demo2-rentflow-2024", full_name: "Демо-арендодатель 2", roles: ["owner"] },
  moderator: { email: "moderator@rentflow.local", password: "moderator-rentflow-2024", full_name: "Модератор", roles: ["moderator", "owner"] },
  developer: { email: "admin@rentflow.local", password: "admin-rentflow-2024", full_name: "Администратор", roles: ["developer", "owner"] },
};

export const ensureDemoAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: DemoKind }) => {
    if (!input || !["demo", "demo2", "moderator", "developer"].includes(input.kind)) {
      throw new Error("Bad kind");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const acc = DEMO_ACCOUNTS[data.kind];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only an existing developer/admin may (re)provision demo accounts.
    const { data: isDev } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "developer",
    });
    if (!isDev) throw new Error("Forbidden");
    // Find existing demo user across all auth pages.
    const { findAuthUserByEmail } = await import("@/lib/auth-users.server");
    const existing = await findAuthUserByEmail(supabaseAdmin, acc.email);
    let user: { id: string } | null = existing ? { id: existing.id } : null;
    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { full_name: acc.full_name, signup_role: "owner" },
      });
      if (error) throw new Error(error.message);
      user = created.user ? { id: created.user.id } : null;
    } else {
      // Ensure password is the expected one (idempotent for repeated demo use)
      await supabaseAdmin.auth.admin.updateUserById(user.id, { password: acc.password, email_confirm: true });
    }
    if (!user) throw new Error("Cannot create demo user");
    // Ensure profile
    await supabaseAdmin.from("profiles").upsert({ id: user.id, full_name: acc.full_name }, { onConflict: "id" });
    // Ensure roles
    for (const r of acc.roles) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: user.id, role: r as any }, { onConflict: "user_id,role" });
    }
    return { ok: true };
  });

export const resetDemo2Account = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const acc = DEMO_ACCOUNTS.demo2;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findAuthUserByEmail } = await import("@/lib/auth-users.server");
    const user = await findAuthUserByEmail(supabaseAdmin, acc.email);
    if (!user) return { ok: true };
    const uid = user.id;
    // Only the demo2 account itself, or a developer, may wipe demo2 data.
    const { data: isDev } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "developer",
    });
    if (context.userId !== uid && !isDev) throw new Error("Forbidden");
    // Tables to wipe (activity_logs intentionally preserved).
    const ownerTables = [
      "payments", "charge_items", "charges", "contracts", "tenants",
      "property_markings", "properties", "tasks", "task_suggestions",
      "lead_events", "leads", "budget_expenses", "budget_plans", "budget_categories",
      "chat_attachments", "chat_messages", "chat_threads",
      "documents", "folders",
    ];
    for (const t of ownerTables) {
      await supabaseAdmin.from(t as any).delete().eq("owner_id", uid);
    }
    await supabaseAdmin.from("notifications").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_links").delete().or(`owner_user_id.eq.${uid},member_user_id.eq.${uid}`);
    return { ok: true };
  });