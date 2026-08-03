import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import {
  EMPTY_METER_DRAFT,
  MeterDraftRows,
  filledMeterDrafts,
  hasInvalidMeterDraft,
} from "@/components/utilities/meter-draft-rows";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_KIND_LABELS,
  PAYMENT_PERIOD_LABELS,
  formatMoney,
  monthlyPayment,
  todayISO,
} from "@/lib/format";
import type { MeterDraft } from "@/lib/meters";

export type { MeterDraft } from "@/lib/meters";

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
  /** Чем сдаётся: квадратные метры, машиноместа или лоты. */
  unit: string;
  /** НДС: ставка в % и признак «в том числе» (иначе начисляется сверх). */
  vat_rate: string;
  vat_included: boolean;
  /** Порядок оплаты: день месяца и к какому месяцу он относится. */
  payment_day: string;
  payment_timing: string;
  /** Переменная часть — возмещение коммуналки, оплачивается отдельным сроком. */
  has_variable_part: boolean;
  variable_payment_day: string;
  variable_part_note: string;
  /** Санкции по договору. */
  penalty_percent_per_day: string;
  misuse_penalty_percent: string;
  /** Срок: считается от акта приёма-передачи и может продлеваться сам. */
  handover_date: string;
  auto_renew: boolean;
  renew_months: string;
  termination_notice_days: string;
  deposit_paid_at: string;
  /** Основание права собственности арендодателя и подсудность споров. */
  ownership_basis: string;
  jurisdiction: string;
  /** Новые счётчики, добавленные в форме (создаются при сохранении). */
  meters: MeterDraft[];
};

/** К какому месяцу относится день оплаты фиксированной части. */
export const PAYMENT_TIMING_LABELS: Record<string, string> = {
  advance: "Предоплата — до N числа предыдущего месяца",
  current: "В расчётном месяце — до N числа",
  arrears: "Постоплата — до N числа следующего месяца",
};

/** Подписи полей площади и цены по единице измерения. */
export const UNIT_LABELS: Record<string, { area: string; rate: string; name: string }> = {
  sqm: { area: "Площадь, м²", rate: "Цена за м² *", name: "Квадратные метры" },
  space: { area: "Количество мест", rate: "Цена за место *", name: "Машиноместа" },
  lot: { area: "Количество лотов", rate: "Цена за лот *", name: "Лоты" },
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
    start_date: initial?.start_date ?? todayISO(),
    end_date: initial?.end_date ?? "",
    status: initial?.status ?? "active",
    kind: initial?.kind ?? "rent",
    notes: initial?.notes ?? "",
    termination_terms: initial?.termination_terms ?? "",
    deposit_percent: initial?.deposit_percent ?? "",
    unit: initial?.unit ?? "sqm",
    vat_rate: initial?.vat_rate ?? "",
    vat_included: initial?.vat_included ?? true,
    payment_day: initial?.payment_day ?? "",
    payment_timing: initial?.payment_timing ?? "",
    has_variable_part: initial?.has_variable_part ?? false,
    variable_payment_day: initial?.variable_payment_day ?? "",
    variable_part_note: initial?.variable_part_note ?? "",
    penalty_percent_per_day: initial?.penalty_percent_per_day ?? "",
    misuse_penalty_percent: initial?.misuse_penalty_percent ?? "",
    handover_date: initial?.handover_date ?? "",
    auto_renew: initial?.auto_renew ?? false,
    renew_months: initial?.renew_months ?? "",
    termination_notice_days: initial?.termination_notice_days ?? "",
    deposit_paid_at: initial?.deposit_paid_at ?? "",
    ownership_basis: initial?.ownership_basis ?? "",
    jurisdiction: initial?.jurisdiction ?? "",
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
          .select("id,name,type,cadastral_no,area_total,base_rate,folder:folders(name)")
          .order("name")
      ).data ?? [],
  });

  // Группировка объектов по папкам-контурам (Помещения / Земля / Офис / Машиноместа …).
  const propertyGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof properties>>();
    for (const p of properties ?? []) {
      const key = (p as { folder?: { name: string } | null }).folder?.name ?? "Без папки";
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "ru"));
  }, [properties]);

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

  const filledMeters = filledMeterDrafts(v.meters);
  const meterInvalid = hasInvalidMeterDraft(v.meters);

  function submitValues() {
    onSubmit({ ...v, meters: filledMeters });
  }

  // Счётчики бывают только у помещений в квадратных метрах: для земли,
  // машиномест и лотов напоминание о счётчиках не показывается.
  const selectedProperty = (properties ?? []).find((p) => p.id === v.property_id);
  const metersApplicable =
    v.unit === "sqm" && !["land", "parking"].includes((selectedProperty as any)?.type ?? "");

  function handleSubmit() {
    if (meterInvalid) return;
    if (metersApplicable && filledMeters.length + existingMetersCount === 0) {
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
              {propertyGroups.map(([folderName, items]) => (
                <SelectGroup key={folderName}>
                  <SelectLabel>{folderName}</SelectLabel>
                  {items.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
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
        <F label="Единица измерения">
          <Select value={v.unit} onValueChange={(x) => set("unit", x)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(UNIT_LABELS).map(([key, u]) => (
                <SelectItem key={key} value={key}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <F label={(UNIT_LABELS[v.unit] ?? UNIT_LABELS.sqm).area}>
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
        <F label={(UNIT_LABELS[v.unit] ?? UNIT_LABELS.sqm).rate}>
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

      {/* Условия из бумажного договора: НДС, сроки оплаты, санкции. Влияют на
          выручку без НДС, дату платежа и расчёт просрочки. */}
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Условия договора: НДС, сроки оплаты, пени
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Ставка НДС, %">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={v.vat_rate}
                onChange={(e) => set("vat_rate", e.target.value)}
                placeholder="20 — или пусто, если без НДС"
              />
            </F>
            <F label="НДС в сумме">
              <Select
                value={v.vat_included ? "included" : "added"}
                onValueChange={(x) => set("vat_included", x === "included")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="included">В том числе НДС</SelectItem>
                  <SelectItem value="added">НДС сверх суммы</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <F label="День оплаты">
              <Input
                type="number"
                min="1"
                max="31"
                value={v.payment_day}
                onChange={(e) => set("payment_day", e.target.value)}
                placeholder="например, 25"
              />
            </F>
            <F label="Порядок оплаты">
              <Select
                value={v.payment_timing || "none"}
                onValueChange={(x) => set("payment_timing", x === "none" ? "" : x)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="не указан" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">не указан</SelectItem>
                  {Object.entries(PAYMENT_TIMING_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={v.has_variable_part}
              onChange={(e) => set("has_variable_part", e.target.checked)}
            />
            Есть переменная часть (возмещение коммуналки)
          </label>
          {v.has_variable_part && (
            <div className="grid sm:grid-cols-2 gap-3">
              <F label="День оплаты переменной части">
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={v.variable_payment_day}
                  onChange={(e) => set("variable_payment_day", e.target.value)}
                  placeholder="например, 15"
                />
              </F>
              <F label="Что входит в переменную часть">
                <Input
                  value={v.variable_part_note}
                  onChange={(e) => set("variable_part_note", e.target.value)}
                  placeholder="электро, вода, тепло, интернет"
                />
              </F>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Пени за день просрочки, %">
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={v.penalty_percent_per_day}
                onChange={(e) => set("penalty_percent_per_day", e.target.value)}
                placeholder="например, 0.1"
              />
            </F>
            <F label="Штраф за нецелевое использование, %">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={v.misuse_penalty_percent}
                onChange={(e) => set("misuse_penalty_percent", e.target.value)}
                placeholder="например, 20"
              />
            </F>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Дата акта приёма-передачи">
              <Input
                type="date"
                value={v.handover_date}
                onChange={(e) => set("handover_date", e.target.value)}
              />
            </F>
            <F label="Обеспечительный платёж внесён">
              <Input
                type="date"
                value={v.deposit_paid_at}
                onChange={(e) => set("deposit_paid_at", e.target.value)}
              />
            </F>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={v.auto_renew}
              onChange={(e) => set("auto_renew", e.target.checked)}
            />
            Автоматическая пролонгация
          </label>
          {v.auto_renew && (
            <F label="Продлевается на, месяцев">
              <Input
                type="number"
                min="1"
                max="120"
                value={v.renew_months}
                onChange={(e) => set("renew_months", e.target.value)}
                placeholder="например, 11"
              />
            </F>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Срок уведомления о расторжении, дней">
              <Input
                type="number"
                min="0"
                value={v.termination_notice_days}
                onChange={(e) => set("termination_notice_days", e.target.value)}
                placeholder="например, 14"
              />
            </F>
            <F label="Подсудность">
              <Input
                value={v.jurisdiction}
                onChange={(e) => set("jurisdiction", e.target.value)}
                placeholder="Арбитражный суд Республики Татарстан"
              />
            </F>
          </div>

          <F label="Основание права собственности арендодателя">
            <Input
              value={v.ownership_basis}
              onChange={(e) => set("ownership_basis", e.target.value)}
              placeholder="Договор купли-продажи КП-194/2021 от 29.12.2021"
            />
          </F>
        </div>
      </details>
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
      <MeterDraftRows
        drafts={v.meters}
        onChange={(m) => set("meters", m)}
        existingCount={existingMetersCount}
      />
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
                set("meters", [...v.meters, { ...EMPTY_METER_DRAFT }]);
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
