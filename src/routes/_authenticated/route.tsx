import { createFileRoute, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log.functions";

// Demo mode: authentication is bypassed. A shared demo account is auto-signed-in
// so existing RLS (owner_id = auth.uid()) keeps working. Role gating happens
// client-side via the DemoIdentityProvider in __root.tsx.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthLayout,
});

function AuthLayout() {
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastLogged = useRef<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);
  useEffect(() => {
    if (!ready) return;
    if (lastLogged.current === pathname) return;
    if (pathname.startsWith("/admin/logs")) return;
    lastLogged.current = pathname;
    const t = setTimeout(() => {
      logActivity({ data: { action: "view", route: pathname } }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [pathname, ready]);
  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
