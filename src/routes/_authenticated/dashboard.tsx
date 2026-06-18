import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { formatMoney, formatDate, daysUntil } from "@/lib/format";
import { Building2, Users, AlertTriangle, Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [props, tenants, charges, contracts] = await Promise.all([
        supabase.from("properties").select("id,status"),
        supabase.from("tenants").select("id"),
        supabase.from("charges").select("id,total,paid_total,status,due_date,contract_id"),
        supabase
          .from("contracts")
          .select("id,number,end_date,status,tenant:tenants(name),property:properties(name)")
          .eq("status", "active")
          .not("end_date", "is", null)
          .order("end_date", { ascending: true })
          .limit(10),
      ]);
      return {
        properties: props.data ?? [],
        tenantsCount: tenants.data?.length ?? 0,
        charges: charges.data ?? [],
        endingContracts: contracts.data ?? [],
      };
    },
  });

  if (isLoading) return <div>Загрузка...</div>;
  const d = data!;

  const total = d.properties.length;
  const occupied = d.properties.filter((p) => p.status === "occupied").length;
  const free = d.properties.filter((p) => p.status === "free").length;

  const monthCharges = d.charges;
  const totalBilled = monthCharges.reduce((s, c) => s + Number(c.total), 0);
  const totalPaid = monthCharges.reduce((s, c) => s + Number(c.paid_total), 0);
  const overdue = monthCharges.filter((c) => c.status === "overdue" || c.status === "partial" || c.status === "unpaid");
  const overdueAmount = overdue.reduce((s, c) => s + (Number(c.total) - Number(c.paid_total)), 0);

  const soonEnding = d.endingContracts.filter((c) => {
    const days = daysUntil(c.end_date);
    return days !== null && days <= 30 && days >= -7;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Дашборд</h1>
        <p className="text-muted-foreground text-sm">Обзор вашей аренды</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Building2} label="Объектов" value={total} sub={`Занято: ${occupied} · Свободно: ${free}`} />
        <StatCard icon={Users} label="Арендаторов" value={d.tenantsCount} />
        <StatCard icon={Calendar} label="Начислено всего" value={formatMoney(totalBilled)} />
        <StatCard icon={AlertTriangle} label="Долг" value={formatMoney(overdueAmount)} accent={overdueAmount > 0 ? "destructive" : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Скоро окончание договора</CardTitle>
          </CardHeader>
          <CardContent>
            {soonEnding.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет договоров с окончанием в ближайшие 30 дней.</p>
            ) : (
              <ul className="divide-y">
                {soonEnding.map((c: any) => {
                  const days = daysUntil(c.end_date);
                  return (
                    <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link to="/contracts/$id" params={{ id: c.id }} className="font-medium hover:underline">
                          № {c.number}
                        </Link>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.tenant?.name} · {c.property?.name}
                        </div>
                      </div>
                      <Badge variant={days! < 0 ? "destructive" : days! <= 7 ? "destructive" : "secondary"}>
                        {days! < 0 ? `Просрочен ${-days!} дн.` : `Через ${days} дн.`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Финансы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Начислено" value={formatMoney(totalBilled)} />
            <Row label="Оплачено" value={formatMoney(totalPaid)} />
            <Row label="Остаток к оплате" value={formatMoney(totalBilled - totalPaid)} />
            <Row label="Просрочка" value={formatMoney(overdueAmount)} highlight={overdueAmount > 0} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }: any) {
  return (
    <Card>
      <CardContent className="pt-4 sm:pt-5 px-3 sm:px-6 pb-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className={"text-lg sm:text-2xl font-bold mt-1 break-words " + (accent === "destructive" ? "text-destructive" : "")}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-destructive" : "font-medium"}>{value}</span>
    </div>
  );
}