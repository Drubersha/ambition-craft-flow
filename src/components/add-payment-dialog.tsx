import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayISO } from "@/lib/format";
import { humanError } from "@/lib/human-error";

export const PAYMENT_METHODS = ["Банковский перевод", "Наличные", "Карта", "Другое"] as const;
const LAST_METHOD_KEY = "payments.lastMethod";

export type ExistingPayment = {
  id: string;
  amount: number | string;
  paid_at: string;
  method: string | null;
  comment: string | null;
};

/**
 * Один диалог на создание и правку платежа. Триггер (`trigger`) можно подменить —
 * в шапке карточки это «+ Платёж», в мобильной панели — большая кнопка,
 * в строке платежа — карандаш. `paid_total` начисления пересчитывает триггер в БД.
 */
export function AddPaymentDialog({
  chargeId,
  suggested,
  currency,
  existing,
  trigger,
}: {
  chargeId: string;
  suggested: number;
  currency: string;
  existing?: ExistingPayment;
  trigger?: ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(existing ? Number(existing.amount) : suggested));
  const [paidAt, setPaidAt] = useState(existing?.paid_at ?? todayISO());
  const [method, setMethod] = useState<string>(() => {
    if (existing?.method) return existing.method;
    if (typeof window !== "undefined") {
      const last = localStorage.getItem(LAST_METHOD_KEY);
      if (last) return last;
    }
    return PAYMENT_METHODS[0];
  });
  const [comment, setComment] = useState(existing?.comment ?? "");

  // При открытии диалога «нового» платежа подставляем актуальный остаток.
  function onOpenChange(next: boolean) {
    if (next && !existing) {
      setAmount(String(suggested));
      setPaidAt(todayISO());
    }
    setOpen(next);
  }

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Сумма должна быть больше нуля");
      if (!paidAt) throw new Error("Укажите дату оплаты");
      if (existing) {
        const { error } = await supabase
          .from("payments")
          .update({
            amount: amt,
            paid_at: paidAt,
            method: method || null,
            comment: comment || null,
          })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      // owner_id платежа = владелец начисления (важно для менеджеров).
      const { data: ch, error: chErr } = await supabase
        .from("charges")
        .select("owner_id")
        .eq("id", chargeId)
        .maybeSingle();
      if (chErr || !ch) throw chErr ?? new Error("Начисление не найдено");
      const { error } = await supabase.from("payments").insert({
        owner_id: ch.owner_id,
        charge_id: chargeId,
        amount: amt,
        paid_at: paidAt,
        method: method || null,
        comment: comment || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (typeof window !== "undefined" && method) localStorage.setItem(LAST_METHOD_KEY, method);
      qc.invalidateQueries({ queryKey: ["charge", chargeId] });
      qc.invalidateQueries({ queryKey: ["charge-payments", chargeId] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["contract-charges"] });
      qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
      toast.success(existing ? "Платёж изменён" : "Платёж отмечен");
      setOpen(false);
    },
    onError: (e) => toast.error(humanError(e, "Не удалось сохранить платёж")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> Платёж
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Изменить платёж" : "Отметить оплату"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mut.isPending) mut.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`pay-amount-${chargeId}`}>Сумма, {currency}</Label>
            <Input
              id={`pay-amount-${chargeId}`}
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`pay-date-${chargeId}`}>Дата</Label>
            <Input
              id={`pay-date-${chargeId}`}
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Способ оплаты</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger aria-label="Способ оплаты">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
                {method &&
                  !PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number]) && (
                    <SelectItem value={method}>{method}</SelectItem>
                  )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`pay-comment-${chargeId}`}>Комментарий</Label>
            <Input
              id={`pay-comment-${chargeId}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="например, № платёжного поручения"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Сохранение…" : existing ? "Сохранить" : "Отметить оплату"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Карандаш для строки платежа. */
export function EditPaymentButton(props: {
  chargeId: string;
  currency: string;
  payment: ExistingPayment;
}) {
  return (
    <AddPaymentDialog
      chargeId={props.chargeId}
      suggested={Number(props.payment.amount)}
      currency={props.currency}
      existing={props.payment}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Изменить платёж"
          className="min-h-11 min-w-11"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      }
    />
  );
}
