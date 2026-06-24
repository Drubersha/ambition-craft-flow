import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDemoIdentity } from "@/lib/demo-identity";
import { useTenantContext } from "@/lib/tenant-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me")({
  component: TenantLayout,
});

function TenantLayout() {
  const { setRole } = useDemoIdentity();
  const navigate = useNavigate();
  const ctx = useTenantContext();
  const tenantId = ctx.status === "ready" ? ctx.tenantId : null;

  const { data: tenant } = useQuery({
    queryKey: ["me-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, phone, email, inn")
        .eq("id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (ctx.status === "loading") {
    return <Card className="p-6 text-sm text-muted-foreground">Загрузка кабинета…</Card>;
  }

  if (ctx.status === "no-link") {
    const msg =
      ctx.reason === "no-email"
        ? "Ваш аккаунт не содержит email — попросите арендодателя обновить ваш профиль."
        : ctx.reason === "no-tenant-row"
          ? "Ваш email не совпадает ни с одной записью арендатора у привязанных арендодателей. Попросите арендодателя указать ваш email в карточке арендатора."
          : "Ваш аккаунт арендатора пока не привязан к арендодателю. Попросите арендодателя добавить вас по email.";
    return (
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Кабинет арендатора</h2>
        <p className="text-sm text-muted-foreground">{msg}</p>
      </Card>
    );
  }

  if (ctx.status === "multi") {
    return (
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Выберите арендатора</h2>
        <p className="text-sm text-muted-foreground">
          Ваш аккаунт привязан к нескольким записям арендатора. Выберите, от чьего имени работать.
        </p>
        <Select onValueChange={(v) => ctx.select(v)}>
          <SelectTrigger><SelectValue placeholder="Выберите арендатора" /></SelectTrigger>
          <SelectContent>
            {ctx.tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}{t.owner_name ? ` — ${t.owner_name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase text-muted-foreground">Кабинет арендатора</div>
          <div className="font-semibold truncate">{tenant?.name ?? "…"}</div>
          {ctx.source === "real" && ctx.tenants.length > 1 && (
            <button
              type="button"
              className="text-[10px] underline text-muted-foreground"
              onClick={() => ctx.select("")}
            >
              Сменить арендатора
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setRole("owner"); navigate({ to: "/dashboard" }); }}
        >
          <LogOut className="h-4 w-4 mr-1" /> Выйти из режима
        </Button>
      </Card>
      <Outlet />
    </div>
  );
}