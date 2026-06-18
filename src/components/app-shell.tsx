import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  LayoutDashboard,
  Users,
  FileText,
  Wallet,
  Receipt,
  LogOut,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/properties", label: "Объекты", icon: Building2 },
  { to: "/tenants", label: "Арендаторы", icon: Users },
  { to: "/contracts", label: "Договоры", icon: FileText },
  { to: "/charges", label: "Начисления", icon: Receipt },
  { to: "/payments", label: "Платежи", icon: Wallet },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1 px-2">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden md:flex w-60 flex-col border-r bg-background">
        <div className="flex h-14 items-center gap-2 px-4 border-b">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-semibold">RentFlow</span>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <NavList />
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Выйти
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex h-14 items-center gap-2 border-b bg-background px-3 sticky top-0 z-10">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Навигация</SheetTitle>
              <div className="flex h-14 items-center gap-2 px-4 border-b">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="font-semibold">RentFlow</span>
              </div>
              <div className="py-3">
                <NavList onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="border-t p-2 mt-2">
                <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Выйти
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <Building2 className="h-5 w-5 text-primary" />
          <span className="font-semibold">RentFlow</span>
        </header>
        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}