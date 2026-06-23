import { supabase } from "@/integrations/supabase/client";

// Single shared demo account used across the app while authentication is disabled.
// Real users will be reintroduced later; for now everyone signs in as this account
// so existing RLS policies (owner_id = auth.uid()) keep working.
const DEMO_EMAIL = "demo@rentflow.local";
const DEMO_PASSWORD = "demo-rentflow-2024";

let ensurePromise: Promise<void> | null = null;

export function ensureDemoSession(): Promise<void> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (!error) return;
    // First run on a fresh project — create the demo account.
    const { error: suErr } = await supabase.auth.signUp({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (suErr && !/already/i.test(suErr.message)) {
      console.error("[demo-auth] signUp failed", suErr.message);
    }
    // Try sign-in again (email confirmation may not be required for the project).
    await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  })().catch((e) => {
    console.error("[demo-auth]", e);
    ensurePromise = null;
  });
  return ensurePromise;
}