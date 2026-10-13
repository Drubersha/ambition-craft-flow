import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";
import { PasswordInput } from "@/components/password-input";
import { humanError } from "@/lib/human-error";

const PASSWORD_MIN = 8;

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
  head: () => ({
    meta: [{ title: "Новый пароль — LeasePlease" }, { name: "robots", content: "noindex" }],
  }),
});

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={
        "flex items-center gap-1.5 text-xs " + (ok ? "text-success" : "text-muted-foreground")
      }
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {label}
    </li>
  );
}

/**
 * Страница из письма «Восстановление пароля». Supabase-клиент сам разбирает
 * токен из адреса (detectSessionInUrl) и поднимает сессию восстановления —
 * здесь остаётся только задать новый пароль.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setStatus("ready");
    });
    // Токен из ссылки обрабатывается асинхронно — даём ему несколько секунд.
    const t = setTimeout(() => {
      if (active) setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 6000);
    return () => {
      active = false;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  const checks = useMemo(
    () => ({
      length: password.length >= PASSWORD_MIN,
      letter: /[a-zA-Zа-яА-ЯёЁ]/.test(password),
      digit: /\d/.test(password),
      match: confirm.length > 0 && confirm === password,
    }),
    [password, confirm],
  );
  const valid = checks.length && checks.letter && checks.digit && checks.match;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Пароль изменён. Вы вошли в систему.");
      navigate({ to: "/", replace: true });
    } catch (e) {
      toast.error(humanError(e, "Не удалось изменить пароль"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/20 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center space-y-3">
          <BrandLogo variant="lockup" size="lg" clickable to="/" />
          <h1 className="text-base font-medium text-muted-foreground">Новый пароль</h1>
        </CardHeader>
        <CardContent>
          {status === "checking" && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Проверяем ссылку…
            </div>
          )}
          {status === "invalid" && (
            <div className="space-y-3 text-center">
              <p className="text-sm">
                Ссылка недействительна или устарела. Запросите новую на странице входа — пункт
                «Забыли пароль?».
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">К странице входа</Link>
              </Button>
            </div>
          )}
          {status === "ready" && (
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="reset-password">Новый пароль</Label>
                <PasswordInput
                  id="reset-password"
                  name="new-password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reset-confirm">Новый пароль ещё раз</Label>
                <PasswordInput
                  id="reset-confirm"
                  name="confirm-password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
              <ul className="space-y-1 rounded-md border bg-muted/30 p-3">
                <Requirement ok={checks.length} label={`Не короче ${PASSWORD_MIN} символов`} />
                <Requirement ok={checks.letter} label="Содержит букву" />
                <Requirement ok={checks.digit} label="Содержит цифру" />
                <Requirement ok={checks.match} label="Пароли совпадают" />
              </ul>
              <Button type="submit" className="w-full" disabled={!valid || busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {busy ? "Сохранение…" : "Сохранить пароль"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
