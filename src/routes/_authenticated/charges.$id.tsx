import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChargeStatusBadge } from "@/components/status-badges";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { humanError } from "@/lib/human-error";
import { toast } from "sonner";
import { MobileCollapsible } from "@/components/mobile-collapsible";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { ConfirmButton } from "@/components/confirm-button";
import { AddPaymentDialog, EditPaymentButton } from "@/components/add-payment-dialog";
import { EditChargeDialog } from "@/components/edit-charge-dialog";

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
      const { data, error } = await supabase
        .from("charges")
        .select(
          "*, contract:contracts(id, number, currency, tenant:tenants(id,name), property:properties(id,name))",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["charge-payments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("charge_id", id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("charges").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
      toast.success("Удалено");
      navigate({ to: "/charges" });
    },
    onError: (e) => toast.error(humanError(e, "Не удалось удалить начисление")),
  });

  const delPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charge", id] });
      qc.invalidateQueries({ queryKey: ["charge-payments", id] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
      toast.success("Платёж удалён");
    },
    onError: (e) => toast.error(humanError(e, "Не удалось удалить платёж")),
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

  const paymentDialog = (trigger?: React.ReactNode) => (
    <AddPaymentDialog
      chargeId={id}
      suggested={Math.max(0, remaining)}
      currency={currency}
      trigger={trigger}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/charges">
            <ArrowLeft className="h-4 w-4 mr-1" /> К списку
          </Link>
        </Button>
        <ConfirmButton
          variant="destructive"
          size="sm"
          className="hidden md:inline-flex"
          destructive
          title="Удалить начисление?"
          description="Начисление и связанные платежи будут удалены."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Удалить</span>
        </ConfirmButton>
      </div>
      <h1 className="text-xl sm:text-2xl font-bold">
        Начисление{charge.contract?.tenant?.name ? ` · ${charge.contract.tenant.name}` : ""}
      </h1>

      <MobileCollapsible
        title="Сводка"
        action={
          <EditChargeDialog
            charge={{
              id: charge.id,
              period_start: charge.period_start,
              period_end: charge.period_end,
              due_date: charge.due_date,
              total: charge.total,
              paid_total: charge.paid_total,
            }}
            currency={currency}
          />
        }
      >
        <div className="space-y-1 text-sm">
          <Row label="Арендатор" value={charge.contract?.tenant?.name} />
          <Row
            label="Договор"
            value={
              charge.contract?.id ? (
                <Link
                  to="/contracts/$id"
                  params={{ id: charge.contract.id }}
                  className="underline underline-offset-2"
                >
                  № {charge.contract?.number || "б/н"}
                </Link>
              ) : (
                `№ ${charge.contract?.number ?? "б/н"}`
              )
            }
          />
          <Row label="Объект" value={charge.contract?.property?.name} />
          <Row
            label="Период"
            value={`${formatDate(charge.period_start)} — ${formatDate(charge.period_end)}`}
          />
          <Row label="Срок оплаты" value={formatDate(charge.due_date)} />
          <Row label="Сумма" value={formatMoney(charge.total, currency)} />
          <Row label="Оплачено" value={formatMoney(charge.paid_total, currency)} />
          <Row label="Остаток" value={formatMoney(remaining, currency)} highlight={remaining > 0} />
          <div className="flex justify-between pt-2 gap-3">
            <span className="text-muted-foreground">Статус</span>
            <ChargeStatusBadge status={charge.status} />
          </div>
        </div>
      </MobileCollapsible>

      <MobileCollapsible title="Платежи" action={paymentDialog()}>
        {!payments || payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Платежей ещё нет. Нажмите «Платёж», чтобы отметить оплату.
          </p>
        ) : (
          <div className="space-y-2">
            {payments.length > 3 && (
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                />
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
            ) : (
              filteredPayments.map((p: any) => (
                <Card key={p.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{formatMoney(p.amount, currency)}</div>
                    <div className="text-xs text-muted-foreground break-words">
                      {formatDate(p.paid_at)}
                      {p.method ? ` · ${p.method}` : ""}
                      {p.comment ? ` · ${p.comment}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center shrink-0">
                    <EditPaymentButton chargeId={id} currency={currency} payment={p} />
                    <ConfirmButton
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить платёж"
                      className="min-h-11 min-w-11"
                      destructive
                      title="Удалить платёж?"
                      description={`Платёж на ${formatMoney(p.amount, currency)} от ${formatDate(p.paid_at)}.`}
                      confirmText="Удалить"
                      onConfirm={() => delPayment.mutate(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </MobileCollapsible>

      <MobileActionBar>
        <ConfirmButton
          variant="outline"
          size="icon"
          className="min-h-11 min-w-11 text-destructive border-destructive/40"
          aria-label="Удалить начисление"
          destructive
          title="Удалить начисление?"
          description="Начисление и связанные платежи будут удалены."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4" />
        </ConfirmButton>
        {paymentDialog(
          <Button size="lg" className="flex-1 min-h-11">
            <Plus className="h-4 w-4 mr-1" /> Отметить оплату
          </Button>,
        )}
      </MobileActionBar>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={
          "text-right break-words " + (highlight ? "font-semibold text-destructive" : "font-medium")
        }
      >
        {value ?? "—"}
      </span>
    </div>
  );
}
