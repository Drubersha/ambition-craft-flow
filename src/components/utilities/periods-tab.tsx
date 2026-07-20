import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { ClosePeriodDialog } from "@/components/utilities/close-period-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  METER_TYPE_LABELS,
  METER_UNITS,
  UTILITY_PERIOD_STATUS_LABELS,
  formatDate,
  formatMoney,
} from "@/lib/format";
import { contractDisplayLabel, type Meter, type MeterReading } from "@/lib/meters";

/** Вкладка «Компенсация»: список закрытых периодов + мастер распределения. */
export function PeriodsTab({
  folderId,
  folders,
  meters,
  readings,
  contracts,
  propertyById,
}: {
  folderId: string;
  folders: { id: string; name: string }[];
  meters: Meter[];
  readings: MeterReading[];
  contracts: any[];
  propertyById: Map<string, any>;
}) {
  const { data: periods } = useQuery({
    queryKey: ["utility-periods"],
    queryFn: async () =>
      (
        await supabase
          .from("utility_periods")
          .select("*, folder:folders(name)")
          .order("period_start", { ascending: false })
      ).data ?? [],
  });
  const qc = useQueryClient();
  const delPeriod = useMutation({
    mutationFn: async (p: any) => {
      // Удаляем расход бюджета, сам период и распределения; начисления
      // остаются — их можно удалить на странице начисления.
      if (p.expense_id) {
        await supabase.from("budget_expenses").delete().eq("id", p.expense_id);
      }
      const { error } = await supabase.from("utility_periods").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["utility-periods"] });
      toast.success("Период удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const visible = (periods ?? []).filter((p: any) => !folderId || p.folder_id === folderId);

  return (
    <>
      <div className="flex justify-end">
        <ClosePeriodDialog
          folders={folders}
          defaultFolderId={folderId}
          meters={meters}
          readings={readings}
          contracts={contracts}
          propertyById={propertyById}
        />
      </div>
      {visible.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Закрытых периодов нет. Нажмите «Распределить расходы», чтобы разнести общий счёт за
          коммуналку по арендаторам и создать начисления.
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((p: any) => (
            <PeriodCard key={p.id} period={p} onDelete={() => delPeriod.mutate(p)} />
          ))}
        </div>
      )}
    </>
  );
}

function PeriodCard({ period, onDelete }: { period: any; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: allocations } = useQuery({
    queryKey: ["utility-allocations", period.id],
    enabled: open,
    queryFn: async () =>
      (
        await supabase
          .from("utility_allocations")
          .select("*, contract:contracts(number, tenant:tenants(name))")
          .eq("period_id", period.id)
          .order("amount", { ascending: false })
      ).data ?? [],
  });
  const unit = METER_UNITS[period.service] ?? "";
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 text-left flex-1"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="font-medium text-sm">
            {METER_TYPE_LABELS[period.service] ?? period.service} ·{" "}
            {formatDate(period.period_start)} — {formatDate(period.period_end)}
          </div>
          <div className="text-xs text-muted-foreground">
            {period.folder?.name ?? "Папка"} · Счёт:{" "}
            {formatMoney(period.total_amount, period.currency)}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={period.status === "allocated" ? "default" : "secondary"}>
            {UTILITY_PERIOD_STATUS_LABELS[period.status] ?? period.status}
          </Badge>
          <ConfirmButton
            variant="ghost"
            size="icon"
            aria-label="Удалить период"
            destructive
            title="Удалить период?"
            description="Распределение и связанный расход бюджета будут удалены. Созданные начисления останутся."
            confirmText="Удалить"
            onConfirm={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </ConfirmButton>
        </div>
      </div>
      {open && (
        <div className="space-y-1 border-t pt-2">
          {!allocations ? (
            <p className="text-xs text-muted-foreground">Загрузка…</p>
          ) : allocations.length === 0 ? (
            <p className="text-xs text-muted-foreground">Распределения нет.</p>
          ) : (
            allocations.map((a: any) => (
              <div key={a.id} className="flex justify-between text-xs gap-2">
                <span className="min-w-0 truncate">
                  {contractDisplayLabel(a.contract)}
                  {a.consumption != null ? ` · ${Number(a.consumption)} ${unit}` : ""}
                </span>
                <span className="font-medium whitespace-nowrap">
                  {formatMoney(a.amount, period.currency)}
                  {a.charge_id && (
                    <Link
                      to="/charges/$id"
                      params={{ id: a.charge_id }}
                      className="ml-2 underline text-muted-foreground"
                    >
                      начисление
                    </Link>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
