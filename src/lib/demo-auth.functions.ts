import { createServerFn } from "@tanstack/react-start";

export type DemoKind = "demo" | "moderator" | "developer";

export const DEMO_ACCOUNTS: Record<DemoKind, { email: string; password: string; full_name: string; roles: string[] }> = {
  demo: { email: "demo@rentflow.local", password: "demo-rentflow-2024", full_name: "Демо-арендодатель", roles: ["owner"] },
  moderator: { email: "moderator@rentflow.local", password: "moderator-rentflow-2024", full_name: "Модератор", roles: ["moderator", "owner"] },
  developer: { email: "admin@rentflow.local", password: "admin-rentflow-2024", full_name: "Администратор", roles: ["developer", "owner"] },
};

export const ensureDemoAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { kind: DemoKind }) => {
    if (!input || !["demo", "moderator", "developer"].includes(input.kind)) {
      throw new Error("Bad kind");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const acc = DEMO_ACCOUNTS[data.kind];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Try to find existing user by listing (small scale demo)
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    let user = list?.users?.find((u) => u.email?.toLowerCase() === acc.email.toLowerCase()) ?? null;
    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { full_name: acc.full_name, signup_role: "owner" },
      });
      if (error) throw new Error(error.message);
      user = created.user;
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