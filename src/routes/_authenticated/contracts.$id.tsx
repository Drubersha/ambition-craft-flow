import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractForm, type ContractFormValues } from "@/components/contract-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus, Search } from "lucide-react";
import { CHARGE_STATUS_LABELS, formatDate, formatMoney, computeDepositWithArea, chargeTotalForPeriod, monthsInRange } from "@/lib/format";
import { useState, useEffect } from "react";
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
  const [live, setLive] = useState<{ rate: number; area: number; period: string; depositPercent: number } | null>(null);
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
      const rateNum = Number(v.rate) || 0;
      const areaNum = Number(v.area) || 0;
      const { error } = await supabase.from("contracts").update({
        tenant_id: v.tenant_id, property_id: v.property_id,
        number: v.number || null, cadastral_no: v.cadastral_no || null,
        area: v.area ? Number(v.area) : null,
        rate: rateNum, currency: v.currency || "RUB",
        payment_period: v.payment_period as any, status: v.status as any,
        kind: v.kind as any,
        start_date: v.start_date, end_date: v.end_date || null,
        notes: v.notes || null,
        termination_terms: v.termination_terms || null,
        deposit_percent: v.deposit_percent ? Number(v.deposit_percent) : null,
        deposit_amount: v.deposit_percent
          ? computeDepositWithArea(rateNum, v.payment_period, areaNum, Number(v.deposit_percent))
          : null,
      }).eq("id", id);
      if (error) throw error;

      // Auto-recalculate future unpaid charges so they stay in sync with the contract's price/area.
      const today = new Date().toISOString().slice(0, 10);
      const { data: future, error: fErr } = await supabase
        .from("charges")
        .select("id, period_start, period_end, paid_total, status")
        .eq("contract_id", id)
        .in("status", ["unpaid", "partial", "overdue"])
        .gte("period_start", today);
      if (fErr) throw fErr;
      for (const c of future ?? []) {
        const newTotal = chargeTotalForPeriod(rateNum, v.payment_period, c.period_start, c.period_end, areaNum);
        if (Number(c.paid_total) > newTotal) continue; // don't shrink below already paid
        const { error: uErr } = await supabase.from("charges").update({ total: newTotal }).eq("id", c.id);
        if (uErr) throw uErr;
      }
      return { recalculated: future?.length ?? 0 };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract", id] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["contract-charges", id] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      toast.success(res?.recalculated
        ? `Сохранено. Пересчитано будущих начислений: ${res.recalculated}`
        : "Сохранено");
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

  const liveRate = live?.rate ?? (Number(data.rate) || 0);
  const liveArea = live?.area ?? (Number(data.area) || 0);
  const livePeriod = live?.period ?? data.payment_period;
  const livePct = live?.depositPercent ?? (Number((data as any).deposit_percent) || 0);
  const depositPctValid = !isNaN(livePct) && livePct >= 0 && livePct <= 1000;
  const rateValid = !isNaN(liveRate) && liveRate >= 0;
  const areaValid = !isNaN(liveArea) && liveArea >= 0;
  const inputsValid = depositPctValid && rateValid && areaValid;
  const depositAmount = inputsValid
    ? computeDepositWithArea(liveRate, livePeriod, liveArea, livePct)
    : 0;
  const totalCharged = (charges ?? []).reduce((s: number, c: any) => s + Number(c.total || 0), 0);
  const totalPaid = (charges ?? []).reduce((s: number, c: any) => s + Number(c.paid_total || 0), 0);
  const overpayment = Math.round((totalPaid - totalCharged) * 100) / 100;
  const depositPercent = livePct;
  const hasDeposit = inputsValid && depositPercent > 0;
  const overpayColor = !hasDeposit
    ? "text-foreground"
    : overpayment >= depositAmount
      ? "text-green-600 dark:text-green-500"
      : "text-red-600 dark:text-red-500";

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
            tenant_id: data.tenant_id, property_id: data.property_id, number: data.number ?? "",
            cadastral_no: data.cadastral_no ?? "", area: data.area ? String(data.area) : "",
            rate: String(data.rate), currency: data.currency, payment_period: data.payment_period,
            start_date: data.start_date, end_date: data.end_date ?? "", status: data.status, notes: data.notes ?? "",
            kind: (data as any).kind ?? "rent",
            termination_terms: (data as any).termination_terms ?? "",
            deposit_percent: (data as any).deposit_percent != null ? String((data as any).deposit_percent) : "",
          }}
          onValuesChange={(v) => setLive({
            rate: Number(v.rate) || 0,
            area: Number(v.area) || 0,
            period: v.payment_period,
            depositPercent: v.deposit_percent === "" ? 0 : Number(v.deposit_percent),
          })}
          onSubmit={(v) => mut.mutate(v)} submitting={mut.isPending}
        />
      </MobileCollapsible>

      <MobileCollapsible title="Обеспечительный платёж">
        {!inputsValid && (
          <p className="text-xs text-destructive mb-2">
            Проверьте поля: площадь, цена и процент должны быть неотрицательными, процент ≤ 1000.
          </p>
        )}
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Процент</div>
            <div className="font-medium">{hasDeposit ? `${depositPercent}%` : "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Расчётная сумма</div>
            <div className="font-medium">{hasDeposit ? formatMoney(depositAmount, data.currency) : "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Переплата (всего оплачено − начислено)</div>
            <div className={`font-semibold ${overpayColor}`}>
              {formatMoney(overpayment, data.currency)}
            </div>
          </div>
        </div>
        {hasDeposit && (
          <p className={`text-xs mt-2 ${overpayColor}`}>
            {overpayment >= depositAmount
              ? `Обеспечительный платёж покрыт (переплата ≥ ${formatMoney(depositAmount, data.currency)}).`
              : `Переплата меньше обеспечительного платежа. Не хватает: ${formatMoney(Math.max(0, depositAmount - overpayment), data.currency)}.`}
          </p>
        )}
      </MobileCollapsible>

      <MobileCollapsible
        title="Начисления по договору"
        action={<NewChargeDialog contractId={id} rate={Number(data.rate)} area={Number(data.area) || 0} currency={data.currency} period={data.payment_period} />}
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

function NewChargeDialog({ contractId, rate, area, currency, period }: { contractId: string; rate: number; area: number; currency: string; period: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = (() => {
    let monthsAhead = 1;
    if (period === "quarterly") monthsAhead = 3;
    if (period === "yearly") monthsAhead = 12;
    return new Date(today.getFullYear(), today.getMonth() + monthsAhead, 0).toISOString().slice(0, 10);
  })();
  const [periodStart, setPeriodStart] = useState(firstDay);
  const [periodEnd, setPeriodEnd] = useState(lastDay);
  const [dueDate, setDueDate] = useState(lastDay);
  const [total, setTotal] = useState(String(chargeTotalForPeriod(rate, period, firstDay, lastDay, area)));
  const [autoCalc, setAutoCalc] = useState(true);

  // Re-derive total when contract rate/area/period change (e.g. after saving the contract form).
  useEffect(() => {
    if (autoCalc) setTotal(String(chargeTotalForPeriod(rate, period, periodStart, periodEnd, area)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, area, period]);

  function recalcOnDates(start: string, end: string) {
    if (autoCalc) setTotal(String(chargeTotalForPeriod(rate, period, start, end, area)));
  }

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
            <div className="space-y-1"><Label>Период с</Label><Input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); recalcOnDates(e.target.value, periodEnd); }} /></div>
            <div className="space-y-1"><Label>Период по</Label><Input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); recalcOnDates(periodStart, e.target.value); }} /></div>
          </div>
          <div className="space-y-1"><Label>Срок оплаты</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Сумма, {currency}</Label>
            <Input
              type="number" step="0.01" value={total}
              onChange={(e) => { setAutoCalc(false); setTotal(e.target.value); }}
            />
            <p className="text-xs text-muted-foreground">
              Авторасчёт: {area || 0} м² × {formatMoney(rate, currency)}/м² × {monthsInRange(periodStart, periodEnd)} мес.
              {!autoCalc && (
                <button type="button" className="ml-2 underline" onClick={() => { setAutoCalc(true); setTotal(String(chargeTotalForPeriod(rate, period, periodStart, periodEnd, area))); }}>
                  пересчитать
                </button>
              )}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}