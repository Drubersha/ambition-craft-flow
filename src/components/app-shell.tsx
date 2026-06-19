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
  FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/folders", label: "Папки", icon: FolderTree },
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
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors min-h-11",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
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
    <div className="flex min-h-[100dvh] bg-muted/20">
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
        <header className="md:hidden flex h-14 items-center gap-2 border-b bg-background px-3 sticky top-0 z-20">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Меню"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 max-w-[85vw] p-0 flex flex-col">
              <SheetTitle className="sr-only">Навигация</SheetTitle>
              <div className="flex h-14 items-center gap-2 px-4 border-b">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="font-semibold">RentFlow</span>
              </div>
              <div className="py-3 flex-1 overflow-y-auto">
                <NavList onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="border-t p-2">
                <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Выйти
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold truncate">RentFlow</span>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={handleSignOut} aria-label="Выйти">
            <LogOut className="h-5 w-5" />
          </Button>
        </header>
        <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-7xl w-full mx-auto pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
      </div>
    </div>
  );
}