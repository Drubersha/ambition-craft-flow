import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDemoIdentity } from "@/lib/demo-identity";
import { CHARGE_STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/me/charges")({
  component: MyCharges,
});

function MyCharges() {
  const { tenantId } = useDemoIdentity();
  const { data } = useQuery({
    queryKey: ["me-charges", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select("id, period_start, period_end, due_date, total, paid_total, status, contract:contracts!inner(number, currency, tenant_id)")
        .eq("contract.tenant_id", tenantId!)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-bold">Мои начисления</h1>
      {!data || data.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Начислений нет.</Card>
      ) : (
        <div className="space-y-2">
          {data.map((c: any) => (
            <Card key={c.id} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm">{formatDate(c.period_start)} — {formatDate(c.period_end)}</div>
                <div className="text-xs text-muted-foreground">
                  Срок оплаты: {formatDate(c.due_date)} · {c.contract?.number ? `Договор № ${c.contract.number}` : "Договор"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Оплачено {formatMoney(c.paid_total, c.contract?.currency)} из {formatMoney(c.total, c.contract?.currency)}
                </div>
              </div>
              <Badge variant={c.status === "paid" ? "default" : c.status === "overdue" ? "destructive" : "secondary"}>
                {CHARGE_STATUS_LABELS[c.status]}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}