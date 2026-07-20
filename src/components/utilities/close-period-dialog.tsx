import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MeterTypeSelect } from "@/components/utilities/meter-type-select";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { METER_UNITS, formatMoney } from "@/lib/format";
import {
  computeAllocationPreview,
  daysOverlap,
  prevMonthRange,
  type AllocationResult,
} from "@/lib/utilities";
import { closeUtilityPeriod } from "@/lib/close-utility-period";
import {
  contractDisplayLabel,
  groupReadingsByMeter,
  type Meter,
  type MeterReading,
} from "@/lib/meters";
import { useEffectiveOwnerId } from "@/lib/manager-context";

/**
 * Мастер «Распределить расходы»: форма периода, предпросмотр распределения
 * (расчёт — computeAllocationPreview) и запуск closeUtilityPeriod.
 */
export function ClosePeriodDialog({
  folders,
  defaultFolderId,
  meters,
  readings,
  contracts,
  propertyById,
}: {
  folders: { id: string; name: string }[];
  defaultFolderId: string;
  meters: Meter[];
  readings: MeterReading[];
  contracts: any[];
  propertyById: Map<string, any>;
}) {
  const [open, setOpen] = useState(false);
  const prev = prevMonthRange();
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [service, setService] = useState("electricity");
  const [periodStart, setPeriodStart] = useState(prev.start);
  const [periodEnd, setPeriodEnd] = useState(prev.end);
  const [total, setTotal] = useState("");
  const [mode, setMode] = useState<"meters_then_area" | "by_area">("meters_then_area");
  const qc = useQueryClient();
  const { ownerId } = useEffectiveOwnerId();

  const readingsByMeter = useMemo(() => groupReadingsByMeter(readings), [readings]);

  // Договоры папки, пересекающиеся с периодом.
  const folderContracts = useMemo(() => {
    if (!folderId) return [];
    return contracts.filter((c) => {
      const p = propertyById.get(c.property_id);
      if (p?.folder_id !== folderId) return false;
      if (c.status !== "active" && c.status !== "finished") return false;
      return daysOverlap(c.start_date, c.end_date, periodStart, periodEnd) > 0;
    });
  }, [contracts, folderId, periodStart, periodEnd, propertyById]);

  const preview = useMemo(
    () =>
      computeAllocationPreview({
        totalAmount: Number(total),
        mode,
        service,
        folderId,
        periodStart,
        periodEnd,
        meters,
        contracts: folderContracts,
        readingsByMeter,
      }),
    [
      total,
      mode,
      service,
      folderId,
      periodStart,
      periodEnd,
      meters,
      folderContracts,
      readingsByMeter,
    ],
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (!ownerId) throw new Error("Не удалось определить арендодателя");
      if (!preview) throw new Error("Заполните папку, период и сумму счёта");
      const { chargesCreated } = await closeUtilityPeriod({
        ownerId,
        folderId,
        service,
        periodStart,
        periodEnd,
        totalAmount: Number(total),
        allocations: preview.allocations,
      });
      return chargesCreated;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["utility-periods"] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      toast.success(`Период закрыт, создано начислений: ${n}`);
      setOpen(false);
      setTotal("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unit = METER_UNITS[service] ?? "";
  const contractLabel = (id: string) => contractDisplayLabel(contracts.find((x) => x.id === id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Receipt className="h-4 w-4 mr-1" /> Распределить расходы
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Компенсация коммунальных услуг</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Папка (группа объектов)</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Услуга</Label>
              <MeterTypeSelect value={service} onChange={setService} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Период с</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Период по</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Общий счёт за услугу, ₽</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Сумма из счёта поставщика"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Способ распределения</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meters_then_area">По счётчикам, остаток по площади</SelectItem>
                  <SelectItem value="by_area">Только по площади</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {folderId && folderContracts.length === 0 && (
            <p className="text-sm text-destructive">
              В папке нет договоров, пересекающихся с периодом.
            </p>
          )}
          {preview && (
            <div className="space-y-2 border rounded-lg p-3">
              <div className="text-sm font-medium">Предпросмотр распределения</div>
              {preview.commonConsumption > 0 && (
                <p className="text-xs text-muted-foreground">
                  Общие счётчики за период: {Math.round(preview.commonConsumption * 1000) / 1000}{" "}
                  {unit} → тариф {formatMoney(Number(total) / preview.commonConsumption)}/{unit}
                </p>
              )}
              <div className="space-y-1">
                {preview.allocations.map((a: AllocationResult) => (
                  <div key={a.contractId} className="flex justify-between text-xs gap-2">
                    <span className="min-w-0 truncate">
                      {contractLabel(a.contractId)}
                      {a.consumption != null
                        ? ` · ${a.consumption} ${unit}`
                        : " · без счётчика (по площади)"}
                    </span>
                    <span className="font-medium whitespace-nowrap">{formatMoney(a.amount)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Итого: {formatMoney(preview.allocations.reduce((s, a) => s + a.amount, 0))} из{" "}
                {formatMoney(Number(total) || 0)}. Каждому арендатору будет создано начисление со
                сроком оплаты через 10 дней; общая сумма попадёт в бюджет папки (категория
                «Коммунальные»).
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !preview}>
            {mut.isPending ? "Создание..." : "Закрыть период и начислить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
