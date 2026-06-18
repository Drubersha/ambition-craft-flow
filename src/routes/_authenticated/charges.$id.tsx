import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { CHARGE_STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { MobileCollapsible } from "@/components/mobile-collapsible";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { ConfirmButton } from "@/components/confirm-button";

export const Route = createFileRoute("/_authenticated/charges/$id")({
  component: ChargeDetail,
});

function ChargeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [paymentQuery, setPaymentQuery] = useState("");

  const { data: charge } = useQuery({
    queryKey: ["charge", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("charges")
        .select("*, contract:contracts(number, currency, tenant:tenants(id,name), property:properties(id,name))")
        .eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["charge-payments", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").eq("charge_id", id).order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("charges").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["charges"] }); toast.success("Удалено"); navigate({ to: "/charges" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const delPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charge", id] });
      qc.invalidateQueries({ queryKey: ["charge-payments", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!charge) return <div>Загрузка...</div>;
  const currency = charge.contract?.currency ?? "RUB";
  const remaining = Number(charge.total) - Number(charge.paid_total);

  const filteredPayments = (payments ?? []).filter((p: any) => {
    if (!paymentQuery) return true;
    const s = paymentQuery.toLowerCase();
    return (
      String(p.amount).includes(s) ||
      formatDate(p.paid_at).toLowerCase().includes(s) ||
      (p.method ?? "").toLowerCase().includes(s) ||
      (p.comment ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild><Link to="/charges"><ArrowLeft className="h-4 w-4 mr-1" /> К списку</Link></Button>
        <ConfirmButton
          variant="destructive" size="sm" className="hidden md:inline-flex" destructive
          title="Удалить начисление?"
          description="Начисление и связанные платежи будут удалены."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Удалить</span>
        </ConfirmButton>
      </div>
      <h1 className="text-xl sm:text-2xl font-bold">Начисление</h1>

      <MobileCollapsible title="Сводка">
        <div className="space-y-1 text-sm">
          <Row label="Арендатор" value={charge.contract?.tenant?.name} />
          <Row label="Договор" value={`№ ${charge.contract?.number}`} />
          <Row label="Объект" value={charge.contract?.property?.name} />
          <Row label="Период" value={`${formatDate(charge.period_start)} — ${formatDate(charge.period_end)}`} />
          <Row label="Срок оплаты" value={formatDate(charge.due_date)} />
          <Row label="Сумма" value={formatMoney(charge.total, currency)} />
          <Row label="Оплачено" value={formatMoney(charge.paid_total, currency)} />
          <Row label="Остаток" value={formatMoney(remaining, currency)} highlight={remaining > 0} />
          <div className="flex justify-between pt-2 gap-3">
            <span className="text-muted-foreground">Статус</span>
            <Badge variant={charge.status === "paid" ? "default" : charge.status === "overdue" ? "destructive" : "secondary"}>
              {CHARGE_STATUS_LABELS[charge.status]}
            </Badge>
          </div>
        </div>
      </MobileCollapsible>

      <MobileCollapsible
        title="Платежи"
        action={<AddPaymentDialog chargeId={id} suggested={Math.max(0, remaining)} currency={currency} />}
      >
        {!payments || payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Платежей ещё нет.</p>
        ) : (
          <div className="space-y-2">
          {payments.length > 3 && (
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Быстрый поиск по платежам"
                placeholder="Поиск по сумме, дате, способу"
                className="pl-9"
                value={paymentQuery}
                onChange={(e) => setPaymentQuery(e.target.value)}
              />
            </div>
          )}
          {filteredPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">Ничего не найдено.</p>
          ) : filteredPayments.map((p: any) => (
            <Card key={p.id} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{formatMoney(p.amount, currency)}</div>
                <div className="text-xs text-muted-foreground break-words">
                  {formatDate(p.paid_at)}{p.method ? ` · ${p.method}` : ""}{p.comment ? ` · ${p.comment}` : ""}
                </div>
              </div>
              <ConfirmButton
                variant="ghost"
                size="icon"
                aria-label="Удалить платёж"
                className="shrink-0 min-h-11 min-w-11"
                destructive
                title="Удалить платёж?"
                description={`Платёж на ${formatMoney(p.amount, currency)} от ${formatDate(p.paid_at)}.`}
                confirmText="Удалить"
                onConfirm={() => delPayment.mutate(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </ConfirmButton>
            </Card>
          ))}
          </div>
        )}
      </MobileCollapsible>

      <MobileActionBar>
        <ConfirmButton
          variant="destructive" size="lg" className="flex-1 min-h-11" destructive
          title="Удалить начисление?"
          description="Начисление и связанные платежи будут удалены."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Удалить начисление
        </ConfirmButton>
      </MobileActionBar>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={"text-right break-words " + (highlight ? "font-semibold text-destructive" : "font-medium")}>{value ?? "—"}</span>
    </div>
  );
}

function AddPaymentDialog({ chargeId, suggested, currency }: { chargeId: string; suggested: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(suggested));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Банковский перевод");
  const [comment, setComment] = useState("");
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("payments").insert({
        owner_id: u.user!.id, charge_id: chargeId,
        amount: Number(amount) || 0, paid_at: paidAt,
        method: method || null, comment: comment || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charge", chargeId] });
      qc.invalidateQueries({ queryKey: ["charge-payments", chargeId] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      toast.success("Платёж отмечен");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Платёж</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Отметить оплату</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Сумма, {currency}</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1"><Label>Дата</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
          <div className="space-y-1"><Label>Способ</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} /></div>
          <div className="space-y-1"><Label>Комментарий</Label><Input value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={() => mut.mutate()} disabled={mut.isPending}>Сохранить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}