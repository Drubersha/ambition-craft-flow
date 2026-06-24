import { supabase } from "@/integrations/supabase/client";
import { DEMO_ACCOUNTS, type DemoKind } from "@/lib/demo-auth.functions";

export async function signInAsDemo(kind: DemoKind): Promise<void> {
  const acc = DEMO_ACCOUNTS[kind];
  // Demo accounts are seeded by migration — the client only signs in.
  // ensureDemoAccount() lives in demo-auth.functions.ts and is developer-only
  // for re-provisioning from the admin panel.
  const { error } = await supabase.auth.signInWithPassword({ email: acc.email, password: acc.password });
  if (error) {
    throw new Error("Демо-аккаунт временно недоступен. Попробуйте позже или обратитесь к администратору.");
  }
  if (typeof window !== "undefined") {
    localStorage.setItem("active_account_kind", "owner");
    const role = kind === "developer" ? "developer" : kind === "moderator" ? "moderator" : "owner";
    localStorage.setItem("demo.role", role);
    localStorage.setItem("demo.kind", kind);
    // Force a full reload so DemoIdentityProvider re-reads the role from localStorage.
    window.location.assign(role === "owner" ? "/dashboard" : "/admin/users");
  }
}