import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ContractStatusBadge } from "@/components/status-badges";
import { useTenantContext } from "@/lib/tenant-context";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/me/contracts")({
  component: MyContracts,
});

function MyContracts() {
  const ctx = useTenantContext();
  const tenantId = ctx.status === "ready" ? ctx.tenantId : null;
  const { data, isLoading } = useQuery({
    queryKey: ["me-contracts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select(
          "id, number, status, start_date, end_date, rate, currency, payment_period, area, property:properties(name, address)",
        )
        .eq("tenant_id", tenantId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-bold">Мои договоры</h1>
      {isLoading ? (
        <div>Загрузка…</div>
      ) : (data ?? []).length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Договоров нет.</Card>
      ) : (
        <div className="space-y-2">
          {data!.map((c: any) => (
            <Card key={c.id} className="p-4 space-y-1">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {c.number ? `Договор № ${c.number}` : "Без номера"}
                  </div>
                  <div className="text-sm text-muted-foreground">{c.property?.name}</div>
                  {c.property?.address && (
                    <div className="text-xs text-muted-foreground">{c.property.address}</div>
                  )}
                </div>
                <ContractStatusBadge status={c.status} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2">
                <div>
                  <span className="text-muted-foreground">Ставка:</span>{" "}
                  {formatMoney(c.rate, c.currency)}
                </div>
                <div>
                  <span className="text-muted-foreground">Площадь:</span> {c.area ?? "—"} м²
                </div>
                <div>
                  <span className="text-muted-foreground">Начало:</span> {formatDate(c.start_date)}
                </div>
                <div>
                  <span className="text-muted-foreground">Окончание:</span> {formatDate(c.end_date)}
                </div>
              </div>
              <div className="pt-2">
                <Link to="/me/charges" className="text-xs text-primary underline">
                  Начисления по договору
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
