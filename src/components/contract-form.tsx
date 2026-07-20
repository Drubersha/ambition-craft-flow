import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Gauge, Plus, Trash2 } from "lucide-react";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_KIND_LABELS,
  PAYMENT_PERIOD_LABELS,
  METER_TYPE_LABELS,
  METER_UNITS,
  formatMoney,
  monthlyPayment,
} from "@/lib/format";

export type MeterDraft = {
  type: string;
  serial_no: string;
  /** Начальное показание — счётчик может быть б/у, поэтому не обязательно 0. */
  start_value: string;
};

export type ContractFormValues = {
  tenant_id: string;
  property_id: string;
  number: string;
  cadastral_no: string;
  area: string;
  rate: string;
  currency: string;
  payment_period: string;
  start_date: string;
  end_date: string;
  status: string;
  kind: string;
  notes: string;
  termination_terms: string;
  deposit_percent: string;
  /** Новые счётчики, добавленные в форме (создаются при сохранении). */
  meters: MeterDraft[];
};

export function ContractForm({
  initial,
  onSubmit,
  submitting,
  formId,
  hideSubmit,
  onValuesChange,
  existingMetersCount = 0,
}: {
  initial?: Partial<ContractFormValues>;
  onSubmit: (v: ContractFormValues) => void;
  submitting?: boolean;
  formId?: string;
  hideSubmit?: boolean;
  onValuesChange?: (v: ContractFormValues) => void;
  /** Сколько счётчиков уже привязано к договору (для страницы редактирования). */
  existingMetersCount?: number;
}) {
  const [v, setV] = useState<ContractFormValues>({
    tenant_id: initial?.tenant_id ?? "",
    property_id: initial?.property_id ?? "",
    number: initial?.number ?? "",
    cadastral_no: initial?.cadastral_no ?? "",
    area: initial?.area ?? "",
    rate: initial?.rate ?? "",
    currency: initial?.currency ?? "RUB",
    payment_period: initial?.payment_period ?? "monthly",
    start_date: initial?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: initial?.end_date ?? "",
    status: initial?.status ?? "active",
    kind: initial?.kind ?? "rent",
    notes: initial?.notes ?? "",
    termination_terms: initial?.termination_terms ?? "",
    deposit_percent: initial?.deposit_percent ?? "",
    meters: initial?.meters ?? [],
  });
  const [meterConfirmOpen, setMeterConfirmOpen] = useState(false);
  const set = <K extends keyof ContractFormValues>(k: K, val: ContractFormValues[K]) =>
    setV((p) => {
      const next = { ...p, [k]: val };
      onValuesChange?.(next);
      return next;
    });

  useEffect(() => {
    onValuesChange?.(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const areaNum = Number(v.area) || 0;
  const rateNum = Number(v.rate) || 0;
  const depositPctNum = Number(v.deposit_percent) || 0;
  const areaInvalid = v.area !== "" && (isNaN(Number(v.area)) || Number(v.area) < 0);
  const rateInvalid = v.rate !== "" && (isNaN(Number(v.rate)) || Number(v.rate) < 0);
  const depositPctInvalid =
    v.deposit_percent !== "" && (isNaN(depositPctNum) || depositPctNum < 0 || depositPctNum > 1000);

  const { data: tenants } = useQuery({
    queryKey: ["tenants-list"],
    queryFn: async () =>
      (await supabase.from("tenants").select("id,name").order("name")).data ?? [],
  });
  const { data: properties } = useQuery({
    queryKey: ["properties-list"],
    queryFn: async () =>
      (
        await supabase
          .from("properties")
          .select("id,name,cadastral_no,area_total,base_rate")
          .order("name")
      ).data ?? [],
  });

  function onPropertyChange(id: string) {
    set("property_id", id);
    const p = properties?.find((x) => x.id === id);
    if (p) {
      if (!v.cadastral_no && p.cadastral_no) set("cadastral_no", p.cadastral_no);
      if (!v.area && p.area_total) set("area", String(p.area_total));
      if (!v.rate && p.base_rate) set("rate", String(p.base_rate));
    }
  }

  const monthly = monthlyPayment(Number(v.rate) || 0, v.payment_period, Number(v.area) || 0);
  const depositAmount = (monthly * (Number(v.deposit_percent) || 0)) / 100;

  const filledMeters = v.meters.filter((m) => m.serial_no.trim() !== "");
  const meterInvalid = v.meters.some(
    (m) => m.start_value !== "" && (isNaN(Number(m.start_value)) || Number(m.start_value) < 0),
  );

  function updateMeter(i: number, patch: Partial<MeterDraft>) {
    set(
      "meters",
      v.meters.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    );
  }

  function submitValues() {
    onSubmit({ ...v, meters: filledMeters });
  }

  function handleSubmit() {
    if (meterInvalid) return;
    if (filledMeters.length + existingMetersCount === 0) {
      setMeterConfirmOpen(true);
      return;
    }
    submitValues();
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-4 max-w-2xl"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="Арендатор *">
          <Select value={v.tenant_id} onValueChange={(x) => set("tenant_id", x)}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите" />
            </SelectTrigger>
            <SelectContent>
              {tenants?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label="Объект *">
          <Select value={v.property_id} onValueChange={onPropertyChange}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите" />
            </SelectTrigger>
            <SelectContent>
              {properties?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="Номер договора">
          <Input value={v.number} onChange={(e) => set("number", e.target.value)} />
        </F>
        <F label="Кадастровый номер">
          <Input value={v.cadastral_no} onChange={(e) => set("cadastral_no", e.target.value)} />
        </F>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <F label="Площадь, м²">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={v.area}
            aria-invalid={areaInvalid || undefined}
            onChange={(e) => set("area", e.target.value)}
          />
          {areaInvalid && (
            <p className="text-xs text-destructive">Площадь не может быть отрицательной.</p>
          )}
        </F>
        <F label="Цена за м² *">
          <Input
            type="number"
            step="0.01"
            min="0"
            required
            value={v.rate}
            aria-invalid={rateInvalid || undefined}
            onChange={(e) => set("rate", e.target.value)}
          />
          {rateInvalid && (
            <p className="text-xs text-destructive">Цена не может быть отрицательной.</p>
          )}
        </F>
        <F label="Валюта">
          <Input
            value={v.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </F>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <F label="Периодичность">
          <Select value={v.payment_period} onValueChange={(x) => set("payment_period", x)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAYMENT_PERIOD_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label="Начало *">
          <Input
            type="date"
            required
            value={v.start_date}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </F>
        <F label="Окончание">
          <Input type="date" value={v.end_date} onChange={(e) => set("end_date", e.target.value)} />
        </F>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="Процент обеспечительного платежа, %">
          <Input
            type="number"
            step="0.01"
            min="0"
            max="1000"
            value={v.deposit_percent}
            aria-invalid={depositPctInvalid || undefined}
            onChange={(e) => set("deposit_percent", e.target.value)}
            placeholder="например, 100"
          />
          {depositPctInvalid && (
            <p className="text-xs text-destructive">Процент должен быть от 0 до 1000.</p>
          )}
        </F>
        <F label="Обеспечительный платёж (расчёт)">
          <Input
            readOnly
            tabIndex={-1}
            value={v.deposit_percent ? formatMoney(depositAmount, v.currency || "RUB") : ""}
            placeholder="—"
            aria-describedby="deposit-help"
          />
          <p id="deposit-help" className="text-xs text-muted-foreground">
            % × ежемесячный платёж ({formatMoney(monthly, v.currency || "RUB")} = площадь × цена за
            м²)
          </p>
        </F>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="Статус">
          <Select value={v.status} onValueChange={(x) => set("status", x)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRACT_STATUS_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label="Тип договора">
          <Select value={v.kind} onValueChange={(x) => set("kind", x)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRACT_KIND_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-primary" /> Счётчики
            {existingMetersCount > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                (уже привязано: {existingMetersCount})
              </span>
            )}
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set("meters", [...v.meters, { type: "electricity", serial_no: "", start_value: "" }])
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Добавить счётчик
          </Button>
        </div>
        {v.meters.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Укажите номер, тип и начальное показание каждого счётчика в помещении — по ним арендатор
            будет подавать показания, а вы — выставлять компенсацию коммуналки.
          </p>
        ) : (
          <div className="space-y-2">
            {v.meters.map((m, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[160px_1fr_140px_auto] gap-2 items-end"
              >
                <div className="space-y-1">
                  {i === 0 && <Label className="text-xs">Тип</Label>}
                  <Select value={m.type} onValueChange={(x) => updateMeter(i, { type: x })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(METER_TYPE_LABELS).map(([k, l]) => (
                        <SelectItem key={k} value={k}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  {i === 0 && <Label className="text-xs">Номер счётчика</Label>}
                  <Input
                    value={m.serial_no}
                    placeholder="Заводской номер"
                    onChange={(e) => updateMeter(i, { serial_no: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  {i === 0 && (
                    <Label className="text-xs">Нач. показание, {METER_UNITS[m.type] ?? ""}</Label>
                  )}
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="0 (или б/у)"
                    value={m.start_value}
                    onChange={(e) => updateMeter(i, { start_value: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Убрать счётчик"
                  onClick={() =>
                    set(
                      "meters",
                      v.meters.filter((_, idx) => idx !== i),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {meterInvalid && (
              <p className="text-xs text-destructive">
                Начальное показание не может быть отрицательным.
              </p>
            )}
          </div>
        )}
      </div>
      <F label="Условия расторжения договора">
        <Textarea
          rows={3}
          value={v.termination_terms}
          onChange={(e) => set("termination_terms", e.target.value)}
          placeholder="Например: уведомление за 30 дней, штраф 1 месячная ставка и т.п."
        />
      </F>
      <F label="Заметки">
        <Textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </F>
      {!hideSubmit && (
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? "Сохранение..." : "Сохранить"}
        </Button>
      )}
      <AlertDialog open={meterConfirmOpen} onOpenChange={setMeterConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы не забыли добавить счётчик?</AlertDialogTitle>
            <AlertDialogDescription>
              К договору не привязан ни один счётчик. Без счётчиков не получится собирать показания
              с арендатора и выставлять компенсацию за коммунальные услуги по потреблению — только
              пропорционально площади.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setMeterConfirmOpen(false);
                set("meters", [
                  ...v.meters,
                  { type: "electricity", serial_no: "", start_value: "" },
                ]);
              }}
            >
              Добавить счётчик
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setMeterConfirmOpen(false);
                submitValues();
              }}
            >
              Сохранить без счётчиков
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
