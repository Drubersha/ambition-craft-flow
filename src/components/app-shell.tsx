import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  LayoutDashboard,
  Users,
  FileText,
  Wallet,
  Receipt,
  Menu,
  FolderTree,
  Kanban,
  MessageSquare,
  User as UserIcon,
  CalendarDays,
  Files,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, useDemoIdentity, type DemoRole } from "@/lib/demo-identity";

const OWNER_NAV = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/folders", label: "Папки", icon: FolderTree },
  { to: "/properties", label: "Объекты", icon: Building2 },
  { to: "/tenants", label: "Арендаторы", icon: Users },
  { to: "/contracts", label: "Договоры", icon: FileText },
  { to: "/charges", label: "Начисления", icon: Receipt },
  { to: "/payments", label: "Платежи", icon: Wallet },
  { to: "/leads", label: "Воронка", icon: Kanban },
  { to: "/chats", label: "Чаты", icon: MessageSquare },
] as const;

const TENANT_NAV = [
  { to: "/me", label: "Мой кабинет", icon: UserIcon },
  { to: "/me/contracts", label: "Мои договоры", icon: FileText },
  { to: "/me/charges", label: "Начисления", icon: Receipt },
  { to: "/me/calendar", label: "Календарь оплат", icon: CalendarDays },
  { to: "/me/documents", label: "Документы", icon: Files },
  { to: "/me/chat", label: "Чат", icon: MessageSquare },
] as const;

function NavList({ onNavigate, role }: { onNavigate?: () => void; role: DemoRole }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = role === "tenant" ? TENANT_NAV : OWNER_NAV;
  return (
    <nav className="flex flex-col gap-1 px-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.to ||
          (item.to !== "/me" && pathname.startsWith(item.to + "/"));
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

function IdentitySwitcher() {
  const { role, tenantId, setRole, setTenantId } = useDemoIdentity();
  const { data: tenants } = useQuery({
    queryKey: ["tenants-for-switcher"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-2 px-3 py-2 border-b bg-muted/30">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Демо: войти как
      </div>
      <Select value={role} onValueChange={(v) => setRole(v as DemoRole)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="owner">{ROLE_LABELS.owner}</SelectItem>
          <SelectItem value="manager">{ROLE_LABELS.manager}</SelectItem>
          <SelectItem value="tenant">{ROLE_LABELS.tenant}</SelectItem>
        </SelectContent>
      </Select>
      {role === "tenant" && (
        <Select
          value={tenantId ?? ""}
          onValueChange={(v) => setTenantId(v || null)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Выберите арендатора" />
          </SelectTrigger>
          <SelectContent>
            {(tenants ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role } = useDemoIdentity();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-muted/20">
      <aside className="hidden md:flex w-60 flex-col border-r bg-background">
        <div className="flex h-14 items-center gap-2 px-4 border-b">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-semibold">RentFlow</span>
        </div>
        <IdentitySwitcher />
        <div className="flex-1 overflow-y-auto py-3">
          <NavList role={role} />
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
              <IdentitySwitcher />
              <div className="py-3 flex-1 overflow-y-auto">
                <NavList onNavigate={() => setMobileOpen(false)} role={role} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold truncate">RentFlow</span>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
        </header>
        <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-7xl w-full mx-auto pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
      </div>
    </div>
  );
}