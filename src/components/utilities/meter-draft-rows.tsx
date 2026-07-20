import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MeterTypeSelect } from "@/components/utilities/meter-type-select";
import { Gauge, Plus, Trash2 } from "lucide-react";
import { METER_UNITS } from "@/lib/format";
import type { MeterDraft } from "@/lib/meters";

export const EMPTY_METER_DRAFT: MeterDraft = {
  type: "electricity",
  serial_no: "",
  start_value: "",
};

/** Черновики с заполненным номером — только они сохраняются. */
export function filledMeterDrafts(drafts: MeterDraft[]): MeterDraft[] {
  return drafts.filter((m) => m.serial_no.trim() !== "");
}

export function hasInvalidMeterDraft(drafts: MeterDraft[]): boolean {
  return drafts.some(
    (m) => m.start_value !== "" && (isNaN(Number(m.start_value)) || Number(m.start_value) < 0),
  );
}

/** Блок «Счётчики» формы договора: редактируемые строки черновиков. */
export function MeterDraftRows({
  drafts,
  onChange,
  existingCount = 0,
}: {
  drafts: MeterDraft[];
  onChange: (drafts: MeterDraft[]) => void;
  /** Сколько счётчиков уже привязано к договору (страница редактирования). */
  existingCount?: number;
}) {
  const update = (i: number, patch: Partial<MeterDraft>) =>
    onChange(drafts.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-primary" /> Счётчики
          {existingCount > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              (уже привязано: {existingCount})
            </span>
          )}
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...drafts, { ...EMPTY_METER_DRAFT }])}
        >
          <Plus className="h-4 w-4 mr-1" /> Добавить счётчик
        </Button>
      </div>
      {drafts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Укажите номер, тип и начальное показание каждого счётчика в помещении — по ним арендатор
          будет подавать показания, а вы — выставлять компенсацию коммуналки.
        </p>
      ) : (
        <div className="space-y-2">
          {drafts.map((m, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[160px_1fr_140px_auto] gap-2 items-end"
            >
              <div className="space-y-1">
                {i === 0 && <Label className="text-xs">Тип</Label>}
                <MeterTypeSelect value={m.type} onChange={(x) => update(i, { type: x })} />
              </div>
              <div className="space-y-1">
                {i === 0 && <Label className="text-xs">Номер счётчика</Label>}
                <Input
                  value={m.serial_no}
                  placeholder="Заводской номер"
                  onChange={(e) => update(i, { serial_no: e.target.value })}
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
                  onChange={(e) => update(i, { start_value: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Убрать счётчик"
                onClick={() => onChange(drafts.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {hasInvalidMeterDraft(drafts) && (
            <p className="text-xs text-destructive">
              Начальное показание не может быть отрицательным.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
