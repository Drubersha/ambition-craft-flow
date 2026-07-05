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
  HelpCircle,
  Settings,
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
import { BrandLogo } from "@/components/brand-logo";
import { recordOnboardingVisit } from "@/components/onboarding-quest";
import { AppFooter } from "@/components/app-footer";
import { BrandIcon } from "@/components/brand-icon";

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
          <BrandIcon icon={LogOut} size="sm" />
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

/** Gear button in the top bar, next to the account email. */
function AccountSettingsButton() {
  return (
    <Button variant="ghost" size="icon" asChild aria-label="Настройки аккаунта">
      <Link to="/settings">
        <BrandIcon icon={Settings} size="sm" />
      </Link>
    </Button>
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
  { to: "/faq", label: "FAQ и помощь", icon: HelpCircle },
] as const;

const TENANT_NAV = [
  { to: "/me", label: "Мой кабинет", icon: UserIcon },
  { to: "/me/contracts", label: "Мои договоры", icon: FileText },
  { to: "/me/charges", label: "Начисления", icon: Receipt },
  { to: "/me/calendar", label: "Календарь оплат", icon: CalendarDays },
  { to: "/me/documents", label: "Документы", icon: Files },
  { to: "/me/chat", label: "Чат", icon: MessageSquare },
  { to: "/faq", label: "FAQ и помощь", icon: HelpCircle },
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
            <BrandIcon icon={Icon} size="sm" tone={active ? "default" : "muted"} />
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
                <BrandIcon icon={Icon} size="sm" tone={active ? "default" : "muted"} />
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
  // Only demo logins (signInAsDemo sets `demo.kind`) get the role switcher.
  // Standard registered accounts never see it.
  const [isDemo] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem("demo.kind"),
  );
  const showManagerPicker = mctx.status === "ready" && role !== "tenant";
  const { data: tenants } = useQuery({
    queryKey: ["tenants-for-switcher"],
    enabled: isDemo && role === "tenant",
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Standard accounts that aren't linked managers have nothing to switch.
  if (!isDemo && !showManagerPicker) return null;

  return (
    <div className="space-y-2 px-3 py-2 border-b bg-muted/30">
      {isDemo && (
        <>
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
        </>
      )}
      {showManagerPicker && (
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

/** Owner/Tenant switch shown in the top bar when the account holds both roles. */
function RoleToggle() {
  const { role, roles, setRole, setTenantId } = useDemoIdentity();
  const navigate = useNavigate();
  if (!roles.includes("owner") || !roles.includes("tenant")) return null;
  const isTenant = role === "tenant";
  const switchTo = (next: "owner" | "tenant") => {
    if (next === role) return;
    setRole(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_account_kind", next);
      // Switching into the tenant cabinet of a real dual-role account must not
      // reuse a stale "view as tenant" selection — resolve by the user's own email.
      if (next === "tenant") {
        setTenantId(null);
        sessionStorage.removeItem("me.selectedTenantId");
      }
    }
    navigate({ to: next === "tenant" ? "/me" : "/dashboard" });
  };
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5 text-xs">
      {(["owner", "tenant"] as const).map((k) => {
        const activeBtn = k === "tenant" ? isTenant : !isTenant;
        return (
          <button
            key={k}
            type="button"
            onClick={() => switchTo(k)}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              activeBtn
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {ROLE_LABELS[k]}
          </button>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, roles } = useDemoIdentity();
  const canSwitchRole = roles.includes("owner") && roles.includes("tenant");
  // Mark onboarding "visit" steps done when their routes are opened from anywhere.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    void recordOnboardingVisit(pathname);
  }, [pathname]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const fetchRoles = useServerFn(getCurrentAdminRoles);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(!!data.session);
      setEmail(data.session?.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!active) return;
      setHasSession(!!session);
      setEmail(session?.user?.email ?? null);
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
      {/* Sticky + viewport-height: on long pages the sidebar used to stretch with
          the content, pushing the logout button below the fold. */}
      <aside className="hidden md:flex w-60 flex-col border-r bg-background md:sticky md:top-0 md:h-[100dvh] md:self-start">
        <div className="flex h-14 items-center gap-2 px-4 border-b">
          <BrandLogo
            variant="lockup"
            size="sm"
            clickable
            to={role === "tenant" ? "/me" : "/dashboard"}
          />
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
                <BrandLogo
                  variant="lockup"
                  size="sm"
                  clickable
                  to={role === "tenant" ? "/me" : "/dashboard"}
                />
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
            <BrandLogo
              variant="lockup"
              size="sm"
              clickable
              to={role === "tenant" ? "/me" : "/dashboard"}
            />
          </div>
          <div className="ml-auto flex items-center gap-2 min-w-0">
            {canSwitchRole && <RoleToggle />}
            <div className="flex flex-col items-end leading-tight min-w-0">
              {email && <span className="text-xs font-medium truncate max-w-[40vw]">{email}</span>}
              {!canSwitchRole && (
                <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[role]}</span>
              )}
            </div>
            <AccountSettingsButton />
            <NotificationsBell />
            <LogoutButton variant="ghost" />
          </div>
        </header>
        <header className="hidden md:flex h-14 items-center border-b bg-background px-6 sticky top-0 z-20">
          <div className="ml-auto flex items-center gap-3">
            {canSwitchRole && <RoleToggle />}
            <div className="flex flex-col items-end leading-tight">
              {email && <span className="text-sm font-medium">{email}</span>}
              {!canSwitchRole && (
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
              )}
            </div>
            <AccountSettingsButton />
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-7xl w-full mx-auto pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
