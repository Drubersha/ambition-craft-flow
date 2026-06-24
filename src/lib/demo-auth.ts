import { supabase } from "@/integrations/supabase/client";
import { ensureDemoAccount, DEMO_ACCOUNTS, type DemoKind } from "@/lib/demo-auth.functions";

export async function signInAsDemo(kind: DemoKind): Promise<void> {
  await ensureDemoAccount({ data: { kind } });
  const acc = DEMO_ACCOUNTS[kind];
  const { error } = await supabase.auth.signInWithPassword({ email: acc.email, password: acc.password });
  if (error) throw error;
  if (typeof window !== "undefined") {
    localStorage.setItem("active_account_kind", "owner");
    const role = kind === "developer" ? "developer" : kind === "moderator" ? "moderator" : "owner";
    localStorage.setItem("demo.role", role);
    // Force a full reload so DemoIdentityProvider re-reads the role from localStorage.
    window.location.assign(role === "tenant" ? "/me" : role === "owner" ? "/dashboard" : "/admin/users");
  }
}