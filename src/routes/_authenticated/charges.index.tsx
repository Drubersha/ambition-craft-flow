import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Calculator, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  CHARGE_STATUS_LABELS,
  chargeTotalForPeriod,
  formatDate,
  formatMoney,
  splitContractPeriods,
} from "@/lib/format";

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold">Начисления</h1>
        <AutoChargesButton />
      </div>
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
              <Card className="p-3 hover:border-primary flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm break-words">{c.contract?.tenant?.name} · № {c.contract?.number}</div>
                  <div className="text-xs text-muted-foreground break-words">
                    {c.contract?.property?.name} · {formatDate(c.period_start)} — {formatDate(c.period_end)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Оплачено {formatMoney(c.paid_total, c.contract?.currency)} из {formatMoney(c.total, c.contract?.currency)}
                  </div>
                </div>
                <Badge className="shrink-0 whitespace-nowrap" variant={c.status === "paid" ? "default" : c.status === "overdue" ? "destructive" : "secondary"}>
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

type PlannedCharge = {
  owner_id: string;
  contract_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  total: number;
};

function AutoChargesButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planned, setPlanned] = useState<PlannedCharge[]>([]);
  const [contractsCount, setContractsCount] = useState(0);

  async function buildPlan() {
    setPlanning(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");
      const { data: contracts, error } = await supabase
        .from("contracts")
        .select("id,start_date,end_date,rate,area,payment_period,kind,status")
        .eq("status", "active")
        .eq("kind", "rent");
      if (error) throw error;

      const ids = (contracts ?? []).map((c) => c.id);
      const existing = new Set<string>();
      if (ids.length > 0) {
        const { data: existCharges, error: e2 } = await supabase
          .from("charges")
          .select("contract_id,period_start")
          .in("contract_id", ids);
        if (e2) throw e2;
        for (const c of existCharges ?? []) existing.add(`${c.contract_id}|${c.period_start}`);
      }

      const today = new Date();
      const all: PlannedCharge[] = [];
      const touched = new Set<string>();
      for (const c of contracts ?? []) {
        if (!c.start_date) continue;
        const segs = splitContractPeriods(c.start_date, c.end_date, c.payment_period, today);
        for (const s of segs) {
          if (existing.has(`${c.id}|${s.period_start}`)) continue;
          const total = chargeTotalForPeriod(
            Number(c.rate),
            c.payment_period,
            s.period_start,
            s.period_end,
            Number(c.area || 0),
          );
          all.push({
            owner_id: u.user.id,
            contract_id: c.id,
            period_start: s.period_start,
            period_end: s.period_end,
            due_date: s.period_end,
            total,
          });
          touched.add(c.id);
        }
      }
      setPlanned(all);
      setContractsCount(touched.size);
      setOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось подготовить начисления");
    } finally {
      setPlanning(false);
    }
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (planned.length === 0) return 0;
      // вставляем порциями, чтобы не упереться в лимит запроса
      const CHUNK = 500;
      for (let i = 0; i < planned.length; i += CHUNK) {
        const slice = planned.slice(i, i + CHUNK);
        const { error } = await supabase.from("charges").insert(slice);
        if (error) throw error;
      }
      return planned.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["contract-charges"] });
      toast.success(`Создано начислений: ${n}`);
      setOpen(false);
      setPlanned([]);
    },
    onError: (e: any) => toast.error(e.message ?? "Ошибка создания начислений"),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={buildPlan} disabled={planning}>
        <Calculator className="h-4 w-4 mr-1" />
        {planning ? "Расчёт..." : "Авторасчёт начислений"}
      </Button>
      <AlertDialogTrigger asChild>
        <span className="hidden" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Авторасчёт начислений</AlertDialogTitle>
          <AlertDialogDescription>
            {planned.length === 0
              ? "Все начисления уже на месте — создавать нечего."
              : `Будет создано ${planned.length} начислений по ${contractsCount} договорам (аренда, активные). Дубликаты по периоду не создаются. Продолжить?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          {planned.length > 0 && (
            <AlertDialogAction onClick={(e) => { e.preventDefault(); mut.mutate(); }} disabled={mut.isPending}>
              {mut.isPending ? "Создаём..." : "Создать"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}