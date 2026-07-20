import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenantContext } from "@/lib/tenant-context";
import { formatDate, formatMoney, CHARGE_STATUS_LABELS } from "@/lib/format";
import { FileText, Receipt, CalendarDays, MessageSquare, Gauge } from "lucide-react";
import { OnboardingQuest } from "@/components/onboarding-quest";

export const Route = createFileRoute("/_authenticated/me/")({
  component: MeDashboard,
});

function MeDashboard() {
  const ctx = useTenantContext();
  const tenantId = ctx.status === "ready" ? ctx.tenantId : null;

  const { data } = useQuery({
    queryKey: ["me-dashboard", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, number, status, start_date, end_date, currency, property:properties(name)")
        .eq("tenant_id", tenantId!)
        .eq("status", "active");
      const { data: charges } = await supabase
        .from("charges")
        .select(
          "id, total, paid_total, due_date, status, contract:contracts!inner(tenant_id, currency)",
        )
        .eq("contract.tenant_id", tenantId!);
      const all = charges ?? [];
      const debt = all
        .filter((c) => c.status !== "paid")
        .reduce((s, c) => s + (Number(c.total) - Number(c.paid_total || 0)), 0);
      const upcoming = all
        .filter((c) => c.status !== "paid" && c.due_date && c.due_date >= today)
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0];
      const overdue = all.filter((c) => c.status === "overdue").length;
      return {
        contracts: contracts ?? [],
        debt,
        upcoming,
        overdue,
      };
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Мой кабинет</h1>
      <OnboardingQuest variant="tenant" />
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Текущий долг</div>
          <div className="text-xl font-semibold mt-1">
            {formatMoney(data?.debt ?? 0, (data?.contracts[0] as any)?.currency ?? "RUB")}
          </div>
          {(data?.overdue ?? 0) > 0 && (
            <Badge variant="destructive" className="mt-2">
              Просрочено: {data?.overdue}
            </Badge>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Ближайший платёж</div>
          {data?.upcoming ? (
            <>
              <div className="text-xl font-semibold mt-1">
                {formatMoney(
                  Number(data.upcoming.total) - Number(data.upcoming.paid_total || 0),
                  (data.upcoming.contract as any)?.currency ?? "RUB",
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                до {formatDate(data.upcoming.due_date)}
              </div>
              <Badge variant="secondary" className="mt-2 text-[10px]">
                {CHARGE_STATUS_LABELS[data.upcoming.status]}
              </Badge>
            </>
          ) : (
            <div className="text-sm text-muted-foreground mt-2">Нет предстоящих</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Активных договоров</div>
          <div className="text-xl font-semibold mt-1">{data?.contracts.length ?? 0}</div>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <QuickLink to="/me/contracts" icon={FileText} label="Мои договоры" />
        <QuickLink to="/me/charges" icon={Receipt} label="Начисления" />
        <QuickLink to="/me/meters" icon={Gauge} label="Передать показания" />
        <QuickLink to="/me/calendar" icon={CalendarDays} label="Календарь оплат" />
        <QuickLink to="/me/chat" icon={MessageSquare} label="Чат с управляющим" />
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: any; icon: any; label: string }) {
  return (
    <Link to={to}>
      <Card className="p-4 flex items-center gap-3 hover:border-primary transition-colors">
        <Icon className="h-5 w-5 text-primary" />
        <span className="font-medium">{label}</span>
      </Card>
    </Link>
  );
}
