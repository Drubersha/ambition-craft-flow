import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractForm, type ContractFormValues } from "@/components/contract-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus, Search } from "lucide-react";
import { CHARGE_STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileCollapsible } from "@/components/mobile-collapsible";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { ConfirmButton } from "@/components/confirm-button";

export const Route = createFileRoute("/_authenticated/contracts/$id")({
  component: EditContract,
});

function EditContract() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [chargeQuery, setChargeQuery] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: charges } = useQuery({
    queryKey: ["contract-charges", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("charges").select("*").eq("contract_id", id).order("period_start", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: async (v: ContractFormValues) => {
      const { error } = await supabase.from("contracts").update({
        tenant_id: v.tenant_id, property_id: v.property_id,
        number: v.number, cadastral_no: v.cadastral_no || null,
        area: v.area ? Number(v.area) : null,
        rate: Number(v.rate) || 0, currency: v.currency || "RUB",
        payment_period: v.payment_period as any, status: v.status as any,
        start_date: v.start_date, end_date: v.end_date || null,
        notes: v.notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract", id] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Сохранено");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast.success("Удалено"); navigate({ to: "/contracts" }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) return <div>Загрузка...</div>;

  const filteredCharges = (charges ?? []).filter((c: any) => {
    if (!chargeQuery) return true;
    const s = chargeQuery.toLowerCase();
    return (
      formatDate(c.period_start).toLowerCase().includes(s) ||
      formatDate(c.period_end).toLowerCase().includes(s) ||
      String(c.total).includes(s) ||
      (CHARGE_STATUS_LABELS[c.status] ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/contracts"><ArrowLeft className="h-4 w-4 mr-1" /> К списку</Link></Button>
        <ConfirmButton
          variant="destructive" size="sm" className="hidden md:inline-flex" destructive
          title="Удалить договор?"
          description="Договор и связанные начисления будут удалены. Действие необратимо."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Удалить</span>
        </ConfirmButton>
      </div>
      <h1 className="text-xl sm:text-2xl font-bold break-words">Договор № {data.number}</h1>
      <MobileCollapsible title="Данные договора">
        <ContractForm
          formId="contract-form"
          initial={{
            tenant_id: data.tenant_id, property_id: data.property_id, number: data.number,
            cadastral_no: data.cadastral_no ?? "", area: data.area ? String(data.area) : "",
            rate: String(data.rate), currency: data.currency, payment_period: data.payment_period,
            start_date: data.start_date, end_date: data.end_date ?? "", status: data.status, notes: data.notes ?? "",
          }}
          onSubmit={(v) => mut.mutate(v)} submitting={mut.isPending}
        />
      </MobileCollapsible>

      <MobileCollapsible
        title="Начисления по договору"
        action={<NewChargeDialog contractId={id} rate={Number(data.rate)} currency={data.currency} />}
      >
        {(!charges || charges.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-4">Начислений нет.</p>
        ) : (
          <div className="space-y-2">
            {charges.length > 3 && (
              <div className="relative">
                <Search aria-hidden="true" className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  aria-label="Быстрый поиск по начислениям"
                  placeholder="Поиск по периоду, сумме, статусу"
                  className="pl-9"
                  value={chargeQuery}
                  onChange={(e) => setChargeQuery(e.target.value)}
                />
              </div>
            )}
            {filteredCharges.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">Ничего не найдено.</p>
            ) : filteredCharges.map((c: any) => (
              <Link key={c.id} to="/charges/$id" params={{ id: c.id }}>
                <Card className="p-3 hover:border-primary flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{formatDate(c.period_start)} — {formatDate(c.period_end)}</div>
                    <div className="text-xs text-muted-foreground break-words">
                      Оплачено {formatMoney(c.paid_total, data.currency)} из {formatMoney(c.total, data.currency)}
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
      </MobileCollapsible>

      <MobileActionBar>
        <ConfirmButton
          variant="destructive" size="lg" className="flex-1 min-h-11" destructive
          title="Удалить договор?"
          description="Договор и связанные начисления будут удалены. Действие необратимо."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Удалить
        </ConfirmButton>
        <Button
          type="submit"
          form="contract-form"
          size="lg"
          className="flex-1 min-h-11"
          disabled={mut.isPending}
        >
          {mut.isPending ? "Сохранение..." : "Сохранить"}
        </Button>
      </MobileActionBar>
    </div>
  );
}

function NewChargeDialog({ contractId, rate, currency }: { contractId: string; rate: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(firstDay);
  const [periodEnd, setPeriodEnd] = useState(lastDay);
  const [dueDate, setDueDate] = useState(lastDay);
  const [total, setTotal] = useState(String(rate));
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("charges").insert({
        owner_id: u.user!.id, contract_id: contractId,
        period_start: periodStart, period_end: periodEnd, due_date: dueDate,
        total: Number(total) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-charges", contractId] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      toast.success("Начисление создано");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Начислить</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Новое начисление</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Период с</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
            <div className="space-y-1"><Label>Период по</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Срок оплаты</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="space-y-1"><Label>Сумма, {currency}</Label><Input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}