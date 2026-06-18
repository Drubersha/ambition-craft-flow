import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments/")({
  component: PaymentsList,
});

function PaymentsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments")
        .select("*, charge:charges(id, contract:contracts(number, currency, tenant:tenants(name)))")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Платежи</h1>
      {isLoading ? <div>Загрузка...</div> : !data || data.length === 0 ? (
        <Card className="p-12 text-center">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">Платежей нет</h3>
          <p className="text-sm text-muted-foreground">Отмечайте оплаты в карточке начисления.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((p: any) => (
            <Link key={p.id} to="/charges/$id" params={{ id: p.charge_id }}>
              <Card className="p-3 hover:border-primary flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{formatMoney(p.amount, p.charge?.contract?.currency)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(p.paid_at)} · {p.charge?.contract?.tenant?.name} · № {p.charge?.contract?.number}
                    {p.method ? ` · ${p.method}` : ""}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}