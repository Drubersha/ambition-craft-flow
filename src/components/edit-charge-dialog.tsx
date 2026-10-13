import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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
import { todayISO } from "@/lib/format";
import { humanError } from "@/lib/human-error";

type ChargeRow = {
  id: string;
  period_start: string;
  period_end: string;
  due_date: string | null;
  total: number | string;
  paid_total: number | string;
};

/** Статус начисления по тем же правилам, что recalc_charge() в базе. */
export function chargeStatusFor(total: number, paid: number, due: string | null): string {
  if (paid >= total && total > 0) return "paid";
  if (paid > 0 && paid < total) return "partial";
  if (due && due < todayISO() && paid < total) return "overdue";
  return "unpaid";
}

/**
 * Правка суммы, периода и срока оплаты начисления. Раньше ошибку в сумме можно было
 * исправить только удалением и созданием заново (платежи терялись).
 */
export function EditChargeDialog({ charge, currency }: { charge: ChargeRow; currency: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(charge.period_start);
  const [periodEnd, setPeriodEnd] = useState(charge.period_end);
  const [dueDate, setDueDate] = useState(charge.due_date ?? "");
  const [total, setTotal] = useState(String(Number(charge.total)));

  function onOpenChange(next: boolean) {
    if (next) {
      setPeriodStart(charge.period_start);
      setPeriodEnd(charge.period_end);
      setDueDate(charge.due_date ?? "");
      setTotal(String(Number(charge.total)));
    }
    setOpen(next);
  }

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(total);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Сумма должна быть больше нуля");
      if (!periodStart || !periodEnd || periodStart > periodEnd)
        throw new Error("Начало периода не может быть позже конца");
      const paid = Number(charge.paid_total);
      const { error } = await supabase
        .from("charges")
        .update({
          period_start: periodStart,
          period_end: periodEnd,
          due_date: dueDate || null,
          total: amt,
          status: chargeStatusFor(amt, paid, dueDate || null) as never,
        })
        .eq("id", charge.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charge", charge.id] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["contract-charges"] });
      qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
      toast.success("Начисление изменено");
      setOpen(false);
    },
    onError: (e) => toast.error(humanError(e, "Не удалось изменить начисление")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Изменить</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Изменить начисление</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mut.isPending) mut.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-charge-start">Период с</Label>
              <Input
                id="edit-charge-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-charge-end">Период по</Label>
              <Input
                id="edit-charge-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-charge-due">Срок оплаты</Label>
            <Input
              id="edit-charge-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-charge-total">Сумма, {currency}</Label>
            <Input
              id="edit-charge-total"
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Оплачено по начислению: {Number(charge.paid_total).toLocaleString("ru-RU")} — статус
              пересчитается автоматически.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
