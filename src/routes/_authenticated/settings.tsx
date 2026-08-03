import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { LandlordRequisitesCard } from "@/components/landlord-requisites-card";
import { Check, Eye, EyeOff, KeyRound, Loader2, Mail, X } from "lucide-react";
import { ROLE_LABELS, useDemoIdentity } from "@/lib/demo-identity";
import { changePassword, PASSWORD_MIN } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        required
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={
        "flex items-center gap-1.5 text-xs " + (ok ? "text-primary" : "text-muted-foreground")
      }
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {label}
    </li>
  );
}

function ChangePasswordCard({ isDemo }: { isDemo: boolean }) {
  const change = useServerFn(changePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const checks = useMemo(
    () => ({
      length: newPassword.length >= PASSWORD_MIN,
      letter: /[a-zA-Zа-яА-ЯёЁ]/.test(newPassword),
      digit: /\d/.test(newPassword),
      match: confirm.length > 0 && confirm === newPassword,
      differs: newPassword.length > 0 && newPassword !== currentPassword,
    }),
    [newPassword, confirm, currentPassword],
  );
  const valid =
    checks.length &&
    checks.letter &&
    checks.digit &&
    checks.match &&
    checks.differs &&
    !!currentPassword;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await change({ data: { currentPassword, newPassword } });
      // Best practice: keep this session, revoke every other one.
      await supabase.auth.signOut({ scope: "others" }).catch(() => {});
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toast.success(
        res.notified
          ? "Пароль изменён. Уведомление отправлено на почту."
          : "Пароль изменён. Остальные сессии завершены.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось изменить пароль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Смена пароля
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isDemo ? (
          <p className="text-sm text-muted-foreground">
            Это общий демо-аккаунт — его пароль изменить нельзя.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3 max-w-md">
            <div className="space-y-1">
              <Label htmlFor="current-password">Текущий пароль</Label>
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password">Новый пароль</Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password">Новый пароль ещё раз</Label>
              <PasswordInput
                id="confirm-password"
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
              <Requirement ok={checks.differs} label="Отличается от текущего" />
              <Requirement ok={checks.match} label="Пароли совпадают" />
            </ul>
            <Button type="submit" disabled={!valid || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? "Сохранение…" : "Изменить пароль"}
            </Button>
            <p className="text-xs text-muted-foreground">
              После смены пароля все остальные устройства будут разлогинены, а на вашу почту придёт
              уведомление об изменении.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsPage() {
  const { role } = useDemoIdentity();
  const [email, setEmail] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setEmail(data.user?.email ?? null);
      setCreatedAt(data.user?.created_at ?? null);
    });
    return () => {
      active = false;
    };
  }, []);
  const isDemo =
    (typeof window !== "undefined" && !!localStorage.getItem("demo.kind")) ||
    (email ?? "").endsWith(".local");

  return (
    <div className="space-y-4">
      <PageHeader title="Настройки аккаунта" description="Email, пароль и безопасность" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> Данные аккаунта
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={email ?? ""} readOnly disabled />
            </div>
            <div className="space-y-1">
              <Label>Роль</Label>
              <Input value={ROLE_LABELS[role]} readOnly disabled />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Email используется для входа и уведомлений.
            {createdAt &&
              ` Аккаунт создан ${new Date(createdAt).toLocaleDateString("ru-RU")}.`}{" "}
            Чтобы изменить email, напишите в поддержку через раздел «FAQ и помощь».
          </p>
        </CardContent>
      </Card>
      <LandlordRequisitesCard />
      <ChangePasswordCard isDemo={isDemo} />
    </div>
  );
}
