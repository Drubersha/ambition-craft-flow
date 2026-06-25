import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  LayoutDashboard,
  Users,
  FileText,
  Wallet,
  Receipt,
  Menu,
  Kanban,
  MessageSquare,
  KanbanSquare,
  User as UserIcon,
  CalendarDays,
  Files,
  PiggyBank,
  ShieldCheck,
  ScrollText,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, useDemoIdentity, type DemoRole } from "@/lib/demo-identity";
import { useManagerContext } from "@/lib/manager-context";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentAdminRoles } from "@/lib/admin.functions";
import { resetDemo2Account } from "@/lib/demo-auth.functions";
import { logActivitySafe } from "@/lib/activity-log.functions";
import { NotificationsBell } from "@/components/notifications-bell";

function LogoutButton({ variant = "default" }: { variant?: "default" | "ghost" }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await logActivitySafe({ action: "logout" });
    await queryClient.cancelQueries();
    queryClient.clear();
    if (typeof window !== "undefined" && localStorage.getItem("demo.kind") === "demo2") {
      try {
        await resetDemo2Account();
      } catch {
        /* ignore */
      }
    }
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("demo.role");
      localStorage.removeItem("active_account_kind");
      localStorage.removeItem("demo.kind");
    }
    navigate({ to: "/auth", replace: true });
    setLoading(false);
    setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant === "ghost" ? "ghost" : "outline"}
          size={variant === "ghost" ? "icon" : "default"}
          className={variant === "default" ? "w-full" : undefined}
          aria-label="Выйти"
        >
          <LogOut className="h-4 w-4" />
          {variant === "default" && <span className="ml-2">Выйти</span>}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Выйти из аккаунта?</AlertDialogTitle>
          <AlertDialogDescription>
            Текущая сессия будет завершена, и вы вернётесь на экран входа.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              handleLogout();
            }}
          >
            {loading ? "Выход…" : "Выйти"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const OWNER_NAV = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/leads", label: "Воронка", icon: Kanban },
  { to: "/properties", label: "Объекты", icon: Building2 },
  { to: "/tenants", label: "Арендаторы", icon: Users },
  { to: "/contracts", label: "Договоры", icon: FileText },
  { to: "/payments", label: "Оплаты", icon: Wallet },
  { to: "/budgets", label: "Бюджет", icon: PiggyBank },
  { to: "/tasks", label: "Задачи", icon: KanbanSquare },
  { to: "/chats", label: "Чаты", icon: MessageSquare },
  { to: "/users", label: "Пользователи", icon: ShieldCheck },
] as const;

const TENANT_NAV = [
  { to: "/me", label: "Мой кабинет", icon: UserIcon },
  { to: "/me/contracts", label: "Мои договоры", icon: FileText },
  { to: "/me/charges", label: "Начисления", icon: Receipt },
  { to: "/me/calendar", label: "Календарь оплат", icon: CalendarDays },
  { to: "/me/documents", label: "Документы", icon: Files },
  { to: "/me/chat", label: "Чат", icon: MessageSquare },
] as const;

const ADMIN_NAV = [
  { to: "/admin/logs", label: "Журнал действий", icon: ScrollText },
  { to: "/admin/users", label: "Пользователи", icon: ShieldCheck },
] as const;

function NavList({
  onNavigate,
  role,
  isAdmin,
}: {
  onNavigate?: () => void;
  role: DemoRole;
  isAdmin: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items =
    role === "tenant" ? TENANT_NAV : role === "developer" || role === "moderator" ? [] : OWNER_NAV;
  const showAdmin = isAdmin || role === "developer" || role === "moderator";
  return (
    <nav className="flex flex-col gap-1 px-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.to || (item.to !== "/me" && pathname.startsWith(item.to + "/"));
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors min-h-11",
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
      {showAdmin && (
        <>
          <div
            className={cn(
              "px-3 text-[10px] uppercase tracking-wide text-muted-foreground",
              items.length > 0 && "mt-3",
            )}
          >
            Администрирование
          </div>
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors min-h-11",
                  active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}

function IdentitySwitcher() {
  const { role, tenantId, setRole, setTenantId } = useDemoIdentity();
  const mctx = useManagerContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: tenants } = useQuery({
    queryKey: ["tenants-for-switcher"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-2 px-3 py-2 border-b bg-muted/30">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Демо: войти как
      </div>
      <Select
        value={role}
        onValueChange={(v) => {
          const next = v as DemoRole;
          setRole(next);
          if (next !== "tenant" && pathname.startsWith("/me")) {
            navigate({ to: "/dashboard" });
          } else if (next === "tenant" && !pathname.startsWith("/me")) {
            navigate({ to: "/me" });
          }
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="owner">{ROLE_LABELS.owner}</SelectItem>
          <SelectItem value="manager">{ROLE_LABELS.manager}</SelectItem>
          <SelectItem value="tenant">{ROLE_LABELS.tenant}</SelectItem>
          <SelectItem value="developer">{ROLE_LABELS.developer}</SelectItem>
          <SelectItem value="moderator">{ROLE_LABELS.moderator}</SelectItem>
        </SelectContent>
      </Select>
      {role === "tenant" && (
        <Select value={tenantId ?? ""} onValueChange={(v) => setTenantId(v || null)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Выберите арендатора" />
          </SelectTrigger>
          <SelectContent>
            {(tenants ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {mctx.status === "ready" && role !== "tenant" && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Активный арендодатель
          </div>
          <Select value={mctx.selectedOwnerId} onValueChange={(v) => mctx.setSelectedOwnerId(v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Выберите арендодателя" />
            </SelectTrigger>
            <SelectContent>
              {mctx.owners.map((o) => (
                <SelectItem key={o.owner_user_id} value={o.owner_user_id}>
                  {o.owner_full_name || o.owner_email || o.owner_user_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role } = useDemoIdentity();
  const [mobileOpen, setMobileOpen] = useState(false);
  const fetchRoles = useServerFn(getCurrentAdminRoles);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  const rolesQ = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => fetchRoles(),
    staleTime: 60_000,
    enabled: hasSession,
    retry: false,
  });
  const isAdmin =
    (rolesQ.data?.roles?.length ?? 0) > 0 || role === "developer" || role === "moderator";

  return (
    <div className="flex min-h-[100dvh] bg-muted/20">
      <aside className="hidden md:flex w-60 flex-col border-r bg-background">
        <div className="flex h-14 items-center gap-2 px-4 border-b">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-semibold">LeasePlease</span>
          <div className="ml-auto">
            <NotificationsBell />
          </div>
        </div>
        <IdentitySwitcher />
        <div className="flex-1 overflow-y-auto py-3">
          <NavList role={role} isAdmin={isAdmin} />
        </div>
        <div className="border-t p-3">
          <LogoutButton />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex h-14 items-center gap-2 border-b bg-background px-3 sticky top-0 z-20">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Меню">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 max-w-[85vw] p-0 flex flex-col">
              <SheetTitle className="sr-only">Навигация</SheetTitle>
              <div className="flex h-14 items-center gap-2 px-4 border-b">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="font-semibold">LeasePlease</span>
              </div>
              <IdentitySwitcher />
              <div className="py-3 flex-1 overflow-y-auto">
                <NavList onNavigate={() => setMobileOpen(false)} role={role} isAdmin={isAdmin} />
              </div>
              <div className="border-t p-3">
                <LogoutButton />
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold truncate">LeasePlease</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <NotificationsBell />
            <LogoutButton variant="ghost" />
            <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-7xl w-full mx-auto pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
      </div>
    </div>
  );
}
