import { supabase } from "@/integrations/supabase/client";
import {
  DEMO_ACCOUNTS,
  DEMO_OWNER_PASSWORDS,
  startPrivilegedDemoSession,
  type DemoKind,
} from "@/lib/demo-auth.functions";

export async function signInAsDemo(kind: DemoKind): Promise<void> {
  const acc = DEMO_ACCOUNTS[kind];
  // For privileged kinds the password never lives in the client bundle —
  // the server mints a one-time magic link and we navigate to it. For owner
  // demo kinds we use a regular password sign-in (those accounts hold only
  // demo data and have no privileged roles).
  if (kind === "developer" || kind === "moderator") {
    let action_link: string;
    try {
      const res = await startPrivilegedDemoSession({ data: { kind } });
      action_link = res.action_link;
    } catch (e: any) {
      throw new Error(e?.message ?? "Привилегированный демо-вход недоступен в этом окружении");
    }
    if (typeof window !== "undefined") {
      const role = kind === "developer" ? "developer" : "moderator";
      localStorage.setItem("active_account_kind", "owner");
      localStorage.setItem("demo.role", role);
      localStorage.setItem("demo.kind", kind);
      window.location.assign(action_link);
    }
    return;
  }
  const password = DEMO_OWNER_PASSWORDS[kind];
  const { error } = await supabase.auth.signInWithPassword({ email: acc.email, password });
  if (error) {
    throw new Error(
      "Демо-аккаунт временно недоступен. Попробуйте позже или обратитесь к администратору.",
    );
  }
  if (typeof window !== "undefined") {
    localStorage.setItem("active_account_kind", "owner");
    localStorage.setItem("demo.role", "owner");
    localStorage.setItem("demo.kind", kind);
    window.location.assign("/dashboard");
  }
}
