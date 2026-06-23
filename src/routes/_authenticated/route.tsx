import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ensureDemoSession } from "@/lib/demo-auth";

// Demo mode: authentication is bypassed. A shared demo account is auto-signed-in
// so existing RLS (owner_id = auth.uid()) keeps working. Role gating happens
// client-side via the DemoIdentityProvider in __root.tsx.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: DemoLayout,
});

function DemoLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ensureDemoSession().finally(() => setReady(true));
  }, []);
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