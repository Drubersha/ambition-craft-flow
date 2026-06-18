import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CHARGE_STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/charges/$id")({
  component: ChargeDetail,
});

function ChargeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild><Link to="/charges"><ArrowLeft className="h-4 w-4 mr-1" /> К списку</Link></Button>
        <Button variant="destructive" size="sm" onClick={() => { if (confirm("Удалить начисление?")) del.mutate(); }}>
          <Trash2 className="h-4 w-4 mr-1" /> Удалить
        </Button>
      </div>
      <h1 className="text-2xl font-bold">Начисление</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Сводка</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="Арендатор" value={charge.contract?.tenant?.name} />
          <Row label="Договор" value={`№ ${charge.contract?.number}`} />
          <Row label="Объект" value={charge.contract?.property?.name} />
          <Row label="Период" value={`${formatDate(charge.period_start)} — ${formatDate(charge.period_end)}`} />
          <Row label="Срок оплаты" value={formatDate(charge.due_date)} />
          <Row label="Сумма" value={formatMoney(charge.total, currency)} />
          <Row label="Оплачено" value={formatMoney(charge.paid_total, currency)} />
          <Row label="Остаток" value={formatMoney(remaining, currency)} highlight={remaining > 0} />
          <div className="flex justify-between pt-2">
            <span className="text-muted-foreground">Статус</span>
            <Badge variant={charge.status === "paid" ? "default" : charge.status === "overdue" ? "destructive" : "secondary"}>
              {CHARGE_STATUS_LABELS[charge.status]}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Платежи</h2>
        <AddPaymentDialog chargeId={id} suggested={Math.max(0, remaining)} currency={currency} />
      </div>
      {!payments || payments.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">Платежей ещё нет.</Card>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <Card key={p.id} className="p-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{formatMoney(p.amount, currency)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(p.paid_at)}{p.method ? ` · ${p.method}` : ""}{p.comment ? ` · ${p.comment}` : ""}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { if (confirm("Удалить платёж?")) delPayment.mutate(p.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-destructive" : "font-medium"}>{value ?? "—"}</span>
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