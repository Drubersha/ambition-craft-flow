import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractForm, type ContractFormValues } from "@/components/contract-form";
import { ContractObjectsEditor } from "@/components/contract-objects-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChargeStatusBadge } from "@/components/status-badges";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus, Search, Eye, Gauge } from "lucide-react";
import {
  CHARGE_STATUS_LABELS,
  METER_TYPE_LABELS,
  METER_UNITS,
  formatDate,
  formatMoney,
  formatNum,
  computeDepositWithArea,
  chargeTotalForPeriod,
  monthsInRange,
  todayISO,
} from "@/lib/format";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileCollapsible } from "@/components/mobile-collapsible";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { ConfirmButton } from "@/components/confirm-button";
import { useDemoIdentity } from "@/lib/demo-identity";
import { insertContractMeters } from "@/lib/meters";

export const Route = createFileRoute("/_authenticated/contracts/$id")({
  component: EditContract,
});

function EditContract() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { viewAsTenant } = useDemoIdentity();
  const [chargeQuery, setChargeQuery] = useState("");
  const [live, setLive] = useState<{
    rate: number;
    area: number;
    period: string;
    depositPercent: number;
  } | null>(null);
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
      const { data, error } = await supabase
        .from("charges")
        .select("*")
        .eq("contract_id", id)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: meters } = useQuery({
    queryKey: ["contract-meters", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meters")
        .select("*")
        .eq("contract_id", id)
        .eq("active", true)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
  // Допсоглашения этого договора и, наоборот, основной договор для допника.
  const { data: amendments } = useQuery({
    queryKey: ["contract-amendments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id,number,status,area,rate,start_date")
        .eq("parent_contract_id", id)
        .order("start_date");
      if (error) throw error;
      return data;
    },
  });
  const { data: parentContract } = useQuery({
    queryKey: ["contract-parent", (data as any)?.parent_contract_id ?? "none"],
    enabled: Boolean((data as any)?.parent_contract_id),
    queryFn: async () => {
      const { data: p, error } = await supabase
        .from("contracts")
        .select("id,number,status")
        .eq("id", (data as any).parent_contract_id)
        .single();
      if (error) throw error;
      return p;
    },
  });

  const mut = useMutation({
    mutationFn: async (v: ContractFormValues) => {
      const rateNum = Number(v.rate) || 0;
      const areaNum = Number(v.area) || 0;
      const { error } = await supabase
        .from("contracts")
        .update({
          tenant_id: v.tenant_id,
          property_id: v.property_id,
          number: v.number || null,
          cadastral_no: v.cadastral_no || null,
          area: v.area ? Number(v.area) : null,
          unit: (v.unit as any) || "sqm",
          rate: rateNum,
          currency: v.currency || "RUB",
          payment_period: v.payment_period as any,
          status: v.status as any,
          kind: v.kind as any,
          start_date: v.start_date,
          end_date: v.end_date || null,
          notes: v.notes || null,
          termination_terms: v.termination_terms || null,
          deposit_percent: v.deposit_percent ? Number(v.deposit_percent) : null,
          deposit_amount: v.deposit_percent
            ? computeDepositWithArea(rateNum, v.payment_period, areaNum, Number(v.deposit_percent))
            : null,
        })
        .eq("id", id);
      if (error) throw error;

      // Новые счётчики, добавленные в форме при редактировании.
      try {
        await insertContractMeters({
          ownerId: data!.owner_id,
          contractId: id,
          propertyId: v.property_id,
          drafts: v.meters,
        });
      } catch (e: any) {
        throw new Error(`Счётчики не сохранились: ${e.message}`);
      }

      // Auto-recalculate future unpaid charges so they stay in sync with the contract's price/area.
      const today = todayISO();
      const { data: future, error: fErr } = await supabase
        .from("charges")
        .select("id, period_start, period_end, paid_total, status")
        .eq("contract_id", id)
        .in("status", ["unpaid", "partial", "overdue"])
        .gte("period_start", today);
      if (fErr) throw fErr;
      for (const c of future ?? []) {
        const newTotal = chargeTotalForPeriod(
          rateNum,
          v.payment_period,
          c.period_start,
          c.period_end,
          areaNum,
        );
        if (Number(c.paid_total) > newTotal) continue; // don't shrink below already paid
        const { error: uErr } = await supabase
          .from("charges")
          .update({ total: newTotal })
          .eq("id", c.id);
        if (uErr) throw uErr;
      }
      return { recalculated: future?.length ?? 0 };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract", id] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["contract-charges", id] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["contract-meters", id] });
      qc.invalidateQueries({ queryKey: ["meters"] });
      toast.success(
        res?.recalculated
          ? `Сохранено. Пересчитано будущих начислений: ${res.recalculated}`
          : "Сохранено",
      );
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delMeter = useMutation({
    mutationFn: async (meterId: string) => {
      const { error } = await supabase.from("meters").delete().eq("id", meterId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-meters", id] });
      qc.invalidateQueries({ queryKey: ["meters"] });
      toast.success("Счётчик удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Удалено");
      navigate({ to: "/contracts" });
    },
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
        <Button variant="ghost" size="sm" asChild>
          <Link to="/contracts">
            <ArrowLeft className="h-4 w-4 mr-1" /> К списку
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              viewAsTenant(data.tenant_id);
              navigate({ to: "/me" });
            }}
          >
            <Eye className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">От лица арендатора</span>
          </Button>
          <ConfirmButton
            variant="destructive"
            size="sm"
            className="hidden md:inline-flex"
            destructive
            title="Удалить договор?"
            description="Договор и связанные начисления будут удалены. Действие необратимо."
            confirmText="Удалить"
            onConfirm={() => del.mutate()}
          >
            <Trash2 className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Удалить</span>
          </ConfirmButton>
        </div>
      </div>
      <h1 className="text-xl sm:text-2xl font-bold break-words">
        {data.number ? `Договор № ${data.number}` : "Договор без номера"}
      </h1>
      <MobileCollapsible title="Данные договора">
        <ContractForm
          formId="contract-form"
          initial={{
            tenant_id: data.tenant_id,
            property_id: data.property_id,
            number: data.number ?? "",
            cadastral_no: data.cadastral_no ?? "",
            area: data.area ? String(data.area) : "",
            rate: String(data.rate),
            currency: data.currency,
            payment_period: data.payment_period,
            start_date: data.start_date,
            end_date: data.end_date ?? "",
            status: data.status,
            notes: data.notes ?? "",
            kind: (data as any).kind ?? "rent",
            termination_terms: (data as any).termination_terms ?? "",
            deposit_percent:
              (data as any).deposit_percent != null ? String((data as any).deposit_percent) : "",
            unit: (data as any).unit ?? "sqm",
          }}
          onValuesChange={(v) =>
            setLive({
              rate: Number(v.rate) || 0,
              area: Number(v.area) || 0,
              period: v.payment_period,
              depositPercent: v.deposit_percent === "" ? 0 : Number(v.deposit_percent),
            })
          }
          onSubmit={(v) => mut.mutate(v)}
          submitting={mut.isPending}
          existingMetersCount={meters?.length ?? 0}
        />
      </MobileCollapsible>

      <MobileCollapsible title="Объекты договора">
        <ContractObjectsEditor
          contractId={id}
          ownerId={(data as any).owner_id}
          unit={(data as any).unit ?? "sqm"}
          contractArea={Number(data.area || 0)}
        />
      </MobileCollapsible>

      {(parentContract || (amendments ?? []).length > 0) && (
        <MobileCollapsible title="Допсоглашения">
          {parentContract && (
            <p className="text-sm mb-2">
              Это допсоглашение к договору{" "}
              <Link
                to="/contracts/$id"
                params={{ id: (parentContract as any).id }}
                className="underline underline-offset-2"
              >
                {(parentContract as any).number || "б/н"}
              </Link>
              .
            </p>
          )}
          {(amendments ?? []).length > 0 && (
            <div className="space-y-1.5">
              {(amendments ?? []).map((a: any) => (
                <Link
                  key={a.id}
                  to="/contracts/$id"
                  params={{ id: a.id }}
                  className="flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-2 hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate">{a.number || "б/н"}</span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatNum(Number(a.area || 0))} × {formatNum(Number(a.rate || 0))} ·{" "}
                    {a.status === "active" ? "действует" : a.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </MobileCollapsible>
      )}

      <MobileCollapsible title="Счётчики">
        {!meters || meters.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Счётчиков нет. Добавьте их в форме договора выше — по ним арендатор подаёт показания, а
            вы выставляете компенсацию коммуналки.
          </p>
        ) : (
          <div className="space-y-2">
            {meters.map((m: any) => (
              <Card key={m.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <Gauge className="h-4 w-4 text-primary shrink-0" />
                    {METER_TYPE_LABELS[m.type] ?? m.type} · № {m.serial_no}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Начальное показание: {Number(m.start_value)} {METER_UNITS[m.type] ?? ""}
                  </div>
                </div>
                <ConfirmButton
                  variant="ghost"
                  size="icon"
                  aria-label="Удалить счётчик"
                  className="shrink-0 min-h-11 min-w-11"
                  destructive
                  title="Удалить счётчик?"
                  description={`Счётчик № ${m.serial_no} и все его показания будут удалены.`}
                  confirmText="Удалить"
                  onConfirm={() => delMeter.mutate(m.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground">
              Показания и аналитика — в разделе «Коммуналка».
            </p>
          </div>
        )}
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
            <div className="font-medium">
              {hasDeposit ? formatMoney(depositAmount, data.currency) : "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">
              Переплата (всего оплачено − начислено)
            </div>
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
        action={
          <NewChargeDialog
            contractId={id}
            rate={Number(data.rate)}
            area={Number(data.area) || 0}
            currency={data.currency}
            period={data.payment_period}
          />
        }
      >
        {!charges || charges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Начислений нет.</p>
        ) : (
          <div className="space-y-2">
            {charges.length > 3 && (
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                />
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
            ) : (
              filteredCharges.map((c: any) => (
                <Link key={c.id} to="/charges/$id" params={{ id: c.id }}>
                  <Card className="p-3 hover:border-primary flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">
                        {formatDate(c.period_start)} — {formatDate(c.period_end)}
                      </div>
                      <div className="text-xs text-muted-foreground break-words">
                        Оплачено {formatMoney(c.paid_total, data.currency)} из{" "}
                        {formatMoney(c.total, data.currency)}
                      </div>
                    </div>
                    <ChargeStatusBadge className="shrink-0 whitespace-nowrap" status={c.status} />
                  </Card>
                </Link>
              ))
            )}
          </div>
        )}
      </MobileCollapsible>

      <MobileActionBar>
        <ConfirmButton
          variant="destructive"
          size="lg"
          className="flex-1 min-h-11"
          destructive
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

function NewChargeDialog({
  contractId,
  rate,
  area,
  currency,
  period,
}: {
  contractId: string;
  rate: number;
  area: number;
  currency: string;
  period: string;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = (() => {
    let monthsAhead = 1;
    if (period === "quarterly") monthsAhead = 3;
    if (period === "yearly") monthsAhead = 12;
    return new Date(today.getFullYear(), today.getMonth() + monthsAhead, 0)
      .toISOString()
      .slice(0, 10);
  })();
  const [periodStart, setPeriodStart] = useState(firstDay);
  const [periodEnd, setPeriodEnd] = useState(lastDay);
  const [dueDate, setDueDate] = useState(lastDay);
  const [total, setTotal] = useState(
    String(chargeTotalForPeriod(rate, period, firstDay, lastDay, area)),
  );
  const [autoCalc, setAutoCalc] = useState(true);

  // Re-derive total when contract rate/area/period change (e.g. after saving the contract form).
  useEffect(() => {
    if (autoCalc)
      setTotal(String(chargeTotalForPeriod(rate, period, periodStart, periodEnd, area)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, area, period]);

  function recalcOnDates(start: string, end: string) {
    if (autoCalc) setTotal(String(chargeTotalForPeriod(rate, period, start, end, area)));
  }

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      // Charge owner_id must match the contract owner — fetch from the row to
      // stay correct for both owner-self and linked-manager flows.
      const { data: c, error: cErr } = await supabase
        .from("contracts")
        .select("owner_id")
        .eq("id", contractId)
        .maybeSingle();
      if (cErr || !c) throw cErr ?? new Error("Договор не найден");
      const amt = Number(total);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Сумма должна быть больше нуля");
      if (!periodStart || !periodEnd || periodStart > periodEnd)
        throw new Error("Начало периода не может быть позже конца");
      if (!dueDate) throw new Error("Укажите срок оплаты");
      const { error } = await supabase.from("charges").insert({
        owner_id: c.owner_id,
        contract_id: contractId,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: dueDate,
        total: amt,
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
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Начислить
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новое начисление</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Период с</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  recalcOnDates(e.target.value, periodEnd);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Период по</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  recalcOnDates(periodStart, e.target.value);
                }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Срок оплаты</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Сумма, {currency}</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={total}
              onChange={(e) => {
                setAutoCalc(false);
                setTotal(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Авторасчёт: {area || 0} м² × {formatMoney(rate, currency)}/м² ×{" "}
              {monthsInRange(periodStart, periodEnd)} мес.
              {!autoCalc && (
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => {
                    setAutoCalc(true);
                    setTotal(
                      String(chargeTotalForPeriod(rate, period, periodStart, periodEnd, area)),
                    );
                  }}
                >
                  пересчитать
                </button>
              )}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
