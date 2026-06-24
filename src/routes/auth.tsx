import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInAsDemo } from "@/lib/demo-auth";
import type { DemoKind } from "@/lib/demo-auth.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

type AccountKind = "owner" | "tenant";

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [demoLoading, setDemoLoading] = useState<DemoKind | null>(null);

  async function enterAs(kind: DemoKind) {
    setDemoLoading(kind);
    try {
      await signInAsDemo(kind);
      toast.success("Добро пожаловать");
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось войти");
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>RentFlow — вход</CardTitle></CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>
            <TabsContent value="signin"><SignInForm onDone={() => navigate({ to: "/" })} /></TabsContent>
            <TabsContent value="signup"><SignUpForm onDone={() => setTab("signin")} /></TabsContent>
          </Tabs>
          <div className="mt-6 pt-4 border-t space-y-2">
            <div className="text-xs text-muted-foreground text-center">Быстрый вход для демонстрации</div>
            <Button type="button" variant="outline" className="w-full" disabled={demoLoading !== null} onClick={() => enterAs("demo")}>
              {demoLoading === "demo" ? "..." : "Зайти в демо режим"}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={demoLoading !== null} onClick={() => enterAs("moderator")}>
              {demoLoading === "moderator" ? "..." : "Зайти как модератор"}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={demoLoading !== null} onClick={() => enterAs("developer")}>
              {demoLoading === "developer" ? "..." : "Зайти как администратор"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KindPicker({ value, onChange }: { value: AccountKind; onChange: (v: AccountKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["owner", "tenant"] as AccountKind[]).map((k) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={"rounded-md border p-3 text-sm text-left transition-colors " +
            (value === k ? "border-primary bg-primary/5" : "hover:bg-muted")}>
          <div className="font-medium">{k === "owner" ? "Арендодатель" : "Арендатор"}</div>
          <div className="text-xs text-muted-foreground">{k === "owner" ? "Управляю объектами и арендой" : "Снимаю помещения"}</div>
        </button>
      ))}
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<AccountKind>(() => {
    if (typeof window === "undefined") return "owner";
    return (localStorage.getItem("active_account_kind") as AccountKind) ?? "owner";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const userId = data.user?.id;
      if (!userId) throw new Error("Нет сессии");
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const has = (roles ?? []).some((r: any) => r.role === kind);
      if (!has) {
        await supabase.auth.signOut();
        throw new Error(`У этого аккаунта нет роли «${kind === "owner" ? "Арендодатель" : "Арендатор"}»`);
      }
      localStorage.setItem("active_account_kind", kind);
      // Sync demo identity so the existing UI honors the choice.
      localStorage.setItem("demo.role", kind);
      toast.success("Добро пожаловать");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-3">
      <div className="space-y-1">
        <Label>Войти как</Label>
        <KindPicker value={kind} onChange={setKind} />
      </div>
      <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="space-y-1"><Label>Пароль</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "..." : "Войти"}</Button>
    </form>
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
        email, password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { signup_role: kind, full_name: name || null },
        },
      });
      if (error) throw error;
      toast.success("Аккаунт создан. Можно войти.");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка регистрации");
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
      <div className="space-y-1"><Label>Имя</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="space-y-1"><Label>Пароль</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "..." : "Создать аккаунт"}</Button>
    </form>
  );
}