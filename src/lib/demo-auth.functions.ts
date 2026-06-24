import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DemoKind = "demo" | "demo2" | "moderator" | "developer";

// Identities and roles for demo accounts. Passwords are NOT stored here for
// privileged kinds (moderator/developer) — those must come from server env
// vars (DEMO_MODERATOR_PASSWORD / DEMO_ADMIN_PASSWORD) and are only honored
// when DEMO_PRIVILEGED_ENABLED=1 on the server (non-prod deployments).
export const DEMO_ACCOUNTS: Record<DemoKind, { email: string; full_name: string; roles: string[] }> = {
  demo: { email: "demo@rentflow.local", full_name: "Демо-арендодатель", roles: ["owner"] },
  demo2: { email: "demo2@rentflow.local", full_name: "Демо-арендодатель 2", roles: ["owner"] },
  moderator: { email: "moderator@rentflow.local", full_name: "Модератор", roles: ["moderator", "owner"] },
  developer: { email: "admin@rentflow.local", full_name: "Администратор", roles: ["developer", "owner"] },
};

// Owner-kind demo passwords are intentionally public — those accounts hold
// only seeded demo data and have no privileged roles. The client uses these
// for direct signInWithPassword.
export const DEMO_OWNER_PASSWORDS: Record<"demo" | "demo2", string> = {
  demo: "demo-rentflow-2024",
  demo2: "demo2-rentflow-2024",
};

function getPrivilegedPasswordFromEnv(kind: DemoKind): string | null {
  if (kind === "developer") return process.env.DEMO_ADMIN_PASSWORD ?? null;
  if (kind === "moderator") return process.env.DEMO_MODERATOR_PASSWORD ?? null;
  if (kind === "demo") return DEMO_OWNER_PASSWORDS.demo;
  if (kind === "demo2") return DEMO_OWNER_PASSWORDS.demo2;
  return null;
}

function privilegedDemoEnabled(): boolean {
  return process.env.DEMO_PRIVILEGED_ENABLED === "1" || process.env.DEMO_PRIVILEGED_ENABLED === "true";
}

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
    const password = getPrivilegedPasswordFromEnv(data.kind);
    if (!password) {
      throw new Error("Пароль для этого демо-аккаунта не сконфигурирован на сервере");
    }
    if ((data.kind === "developer" || data.kind === "moderator") && !privilegedDemoEnabled()) {
      throw new Error("Привилегированные демо-аккаунты отключены в этом окружении");
    }
    // Find existing demo user across all auth pages.
    const { findAuthUserByEmail } = await import("@/lib/auth-users.server");
    const existing = await findAuthUserByEmail(supabaseAdmin, acc.email);
    let user: { id: string } | null = existing ? { id: existing.id } : null;
    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: acc.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: acc.full_name, signup_role: "owner" },
      });
      if (error) throw new Error(error.message);
      user = created.user ? { id: created.user.id } : null;
    } else {
      // Ensure password is the expected one (idempotent for repeated demo use)
      await supabaseAdmin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    }
    if (!user) throw new Error("Cannot create demo user");
    // Ensure profile
    await supabaseAdmin.from("profiles").upsert({ id: user.id, full_name: acc.full_name }, { onConflict: "id" });
    // Ensure roles (only assign developer/moderator if privileged demo is enabled)
    const allowedRoles = acc.roles.filter((r) => {
      if (r === "developer" || r === "moderator") return privilegedDemoEnabled();
      return true;
    });
    for (const r of allowedRoles) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: user.id, role: r as any }, { onConflict: "user_id,role" });
    }
    return { ok: true };
  });

// Public-ish server fn used by the auth page to start a privileged demo
// session WITHOUT shipping the password to the client. Returns a magic-link
// action URL the client can navigate to. Disabled in prod (env not set).
export const startPrivilegedDemoSession = createServerFn({ method: "POST" })
  .inputValidator((input: { kind: DemoKind }) => {
    if (!input || !["moderator", "developer"].includes(input.kind)) {
      throw new Error("Bad kind");
    }
    return input;
  })
  .handler(async ({ data }) => {
    if (!privilegedDemoEnabled()) {
      throw new Error("Привилегированный демо-вход отключён в этом окружении");
    }
    const acc = DEMO_ACCOUNTS[data.kind];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ensure the user exists so generateLink succeeds.
    const { findAuthUserByEmail } = await import("@/lib/auth-users.server");
    const existing = await findAuthUserByEmail(supabaseAdmin, acc.email);
    if (!existing) {
      throw new Error("Демо-аккаунт не сконфигурирован. Обратитесь к администратору.");
    }
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: acc.email,
    });
    if (error || !link?.properties?.action_link) {
      throw new Error(error?.message ?? "Не удалось создать ссылку для входа");
    }
    return { action_link: link.properties.action_link };
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