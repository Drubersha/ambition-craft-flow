import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";

export function PaymentsListView() {
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
  if (isLoading) return <div>Загрузка...</div>;
  if (!data || data.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold">Платежей нет</h3>
        <p className="text-sm text-muted-foreground">Отмечайте оплаты в карточке начисления.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {data.map((p: any) => (
        <Link key={p.id} to="/charges/$id" params={{ id: p.charge_id }}>
          <Card className="p-3 hover:border-primary flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">{formatMoney(p.amount, p.charge?.contract?.currency)}</div>
              <div className="text-xs text-muted-foreground break-words">
                {formatDate(p.paid_at)} · {p.charge?.contract?.tenant?.name} · № {p.charge?.contract?.number}
                {p.method ? ` · ${p.method}` : ""}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}