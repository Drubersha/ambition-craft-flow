import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInAsDemo } from "@/lib/demo-auth";
import type { DemoKind } from "@/lib/demo-auth.functions";
import { verifyDemoGate } from "@/lib/demo-gate.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BrandLogo } from "@/components/brand-logo";
import { PasswordInput } from "@/components/password-input";
import { humanError } from "@/lib/human-error";
import { pickRoleAfterLogin } from "@/lib/login-role";
import { PASSWORD_MIN } from "@/lib/account.functions";

const DEMO_LABELS: Record<DemoKind, string> = {
  demo: "Демо режим 1",
  demo2: "Демо режим 2",
  moderator: "Модератор",
  developer: "Администратор",
};

const searchSchema = z.object({
  /** `?demo=1` показывает блок демо-входов; клиентам на боевом домене он не нужен. */
  demo: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: zodValidator(searchSchema),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Вход — LeasePlease" },
      {
        name: "description",
        content: "Вход и регистрация в LeasePlease — системе учёта коммерческой аренды.",
      },
      { property: "og:title", content: "Вход — LeasePlease" },
      { property: "og:description", content: "Вход и регистрация в LeasePlease." },
      { property: "og:url", content: "/auth" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
});

type AccountKind = "owner" | "tenant";

function AuthPage() {
  const navigate = useNavigate();
  const { demo } = Route.useSearch();
  const showDemo = demo === "1";
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [demoLoading, setDemoLoading] = useState<DemoKind | null>(null);
  const [gateKind, setGateKind] = useState<DemoKind | null>(null);
  const [gateLogin, setGateLogin] = useState("");
  const [gatePassword, setGatePassword] = useState("");

  async function openGate(kind: DemoKind) {
    const { data, error } = await supabase.auth.getUser();
    if (data?.user && !error) {
      toast.error("В аккаунт уже вошли, дождитесь когда выйдут");
      return;
    }
    // Clear any stale local session before opening the gate.
    await supabase.auth.signOut().catch(() => {});
    setGateLogin("");
    setGatePassword("");
    setGateKind(kind);
  }

  async function submitGate(e: React.FormEvent) {
    e.preventDefault();
    if (!gateKind) return;
    const kind = gateKind;
    setDemoLoading(kind);
    try {
      const { ok } = await verifyDemoGate({
        data: { kind, login: gateLogin, password: gatePassword },
      });
      if (!ok) {
        toast.error("Неверный логин или пароль");
        setDemoLoading(null);
        return;
      }
      setGateKind(null);
      await signInAsDemo(kind);
      toast.success("Добро пожаловать");
      navigate({ to: "/" });
    } catch (e) {
      toast.error(humanError(e, "Не удалось войти"));
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/20 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center space-y-3">
          <BrandLogo variant="lockupWithSlogan" size="lg" clickable to="/" />
          <h1 className="text-base font-medium text-muted-foreground">
            {tab === "signin" ? "Вход в систему учёта аренды" : "Регистрация"}
          </h1>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <SignInForm onDone={() => navigate({ to: "/" })} />
            </TabsContent>
            <TabsContent value="signup">
              <SignUpForm onDone={() => setTab("signin")} />
            </TabsContent>
          </Tabs>
          {showDemo && (
            <div className="mt-6 pt-4 border-t space-y-2">
              <div className="text-xs text-muted-foreground text-center">
                Быстрый вход для демонстрации
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={demoLoading !== null}
                onClick={() => openGate("demo")}
              >
                {demoLoading === "demo" ? "..." : "Зайти в демо режим 1"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={demoLoading !== null}
                onClick={() => openGate("demo2")}
              >
                {demoLoading === "demo2" ? "..." : "Зайти в демо режим 2 (авто-очистка при выходе)"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={demoLoading !== null}
                onClick={() => openGate("moderator")}
              >
                {demoLoading === "moderator" ? "..." : "Зайти как модератор"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={demoLoading !== null}
                onClick={() => openGate("developer")}
              >
                {demoLoading === "developer" ? "..." : "Зайти как администратор"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={gateKind !== null}
        onOpenChange={(o) => {
          if (!o) setGateKind(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Вход — {gateKind ? DEMO_LABELS[gateKind] : ""}</DialogTitle>
            <DialogDescription>Введите логин и пароль для доступа</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitGate} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gate-login">Логин</Label>
              <Input
                id="gate-login"
                name="gate-login"
                value={gateLogin}
                onChange={(e) => setGateLogin(e.target.value)}
                autoFocus
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gate-password">Пароль</Label>
              <PasswordInput
                id="gate-password"
                value={gatePassword}
                onChange={setGatePassword}
                autoComplete="current-password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGateKind(null)}>
                Отмена
              </Button>
              <Button type="submit">Войти</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function KindPicker({
  value,
  onChange,
}: {
  value: AccountKind;
  onChange: (v: AccountKind) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Тип аккаунта">
      {(["owner", "tenant"] as AccountKind[]).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={
            "rounded-md border p-3 text-sm text-left transition-colors " +
            (value === k ? "border-primary bg-primary/5" : "hover:bg-muted")
          }
        >
          <div className="font-medium">{k === "owner" ? "Арендодатель" : "Арендатор"}</div>
          <div className="text-xs text-muted-foreground">
            {k === "owner" ? "Управляю объектами и арендой" : "Снимаю помещения"}
          </div>
        </button>
      ))}
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const userId = data.user?.id;
      if (!userId) throw new Error("Нет сессии");
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const list = (roles ?? []).map((r: { role: string }) => r.role);
      const stored =
        typeof window !== "undefined" ? localStorage.getItem("active_account_kind") : null;
      const kind = pickRoleAfterLogin(list, stored);
      localStorage.setItem("active_account_kind", kind);
      // Sync demo identity so the existing UI honors the choice.
      localStorage.setItem("demo.role", kind);
      toast.success("Добро пожаловать");
      onDone();
    } catch (e) {
      toast.error(humanError(e, "Ошибка входа"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-3 pt-3">
        <div className="space-y-1">
          <Label htmlFor="signin-email">Email</Label>
          <Input
            id="signin-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="signin-password">Пароль</Label>
            <button
              type="button"
              className="text-xs text-primary underline-offset-2 hover:underline min-h-6"
              onClick={() => setForgotOpen(true)}
            >
              Забыли пароль?
            </button>
          </div>
          <PasswordInput
            id="signin-password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Входим…" : "Войти"}
        </Button>
      </form>
      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} initialEmail={email} />
    </>
  );
}

function ForgotPasswordDialog({
  open,
  onOpenChange,
  initialEmail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialEmail: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function handleOpenChange(o: boolean) {
    if (o) {
      setEmail(initialEmail);
      setSent(false);
    }
    onOpenChange(o);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      toast.error(humanError(e, "Не удалось отправить письмо"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Восстановление пароля</DialogTitle>
          <DialogDescription>
            Пришлём на почту ссылку, по которой можно задать новый пароль.
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="space-y-3">
            <p className="text-sm">
              Если адрес <span className="font-medium">{email}</span> зарегистрирован, письмо уже в
              пути. Ссылка действует час; если письма нет — проверьте «Спам».
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Понятно
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? "Отправка…" : "Отправить ссылку"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<AccountKind>("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { signup_role: kind, full_name: name || null },
        },
      });
      if (error) throw error;
      toast.success("Аккаунт создан. Можно войти.");
      onDone();
    } catch (e) {
      toast.error(humanError(e, "Ошибка регистрации"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-3">
      <div className="space-y-1">
        <Label>Регистрация как</Label>
        <KindPicker value={kind} onChange={setKind} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-name">Имя</Label>
        <Input
          id="signup-name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-password">Пароль</Label>
        <PasswordInput
          id="signup-password"
          name="new-password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
        />
        <p className="text-xs text-muted-foreground">
          Не короче {PASSWORD_MIN} символов, буква и цифра.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "..." : "Создать аккаунт"}
      </Button>
    </form>
  );
}
