import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt } from "lucide-react";
import { CHARGE_STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/charges/")({
  component: ChargesList,
});

function ChargesList() {
  const { data, isLoading } = useQuery({
    queryKey: ["charges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("charges")
        .select("*, contract:contracts(number, currency, tenant:tenants(name), property:properties(name))")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Начисления</h1>
      {isLoading ? <div>Загрузка...</div> : !data || data.length === 0 ? (
        <Card className="p-12 text-center">
          <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">Начислений нет</h3>
          <p className="text-sm text-muted-foreground">Создайте начисление из карточки договора.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((c: any) => (
            <Link key={c.id} to="/charges/$id" params={{ id: c.id }}>
              <Card className="p-3 hover:border-primary flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{c.contract?.tenant?.name} · № {c.contract?.number}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.contract?.property?.name} · {formatDate(c.period_start)} — {formatDate(c.period_end)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Оплачено {formatMoney(c.paid_total, c.contract?.currency)} из {formatMoney(c.total, c.contract?.currency)}
                  </div>
                </div>
                <Badge variant={c.status === "paid" ? "default" : c.status === "overdue" ? "destructive" : "secondary"}>
                  {CHARGE_STATUS_LABELS[c.status]}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}