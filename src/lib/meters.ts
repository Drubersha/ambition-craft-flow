/**
 * Доменный слой счётчиков: общие типы, группировки показаний и операции
 * с БД, используемые и в кабинете арендатора, и в разделе «Коммуналка».
 */
import { supabase } from "@/integrations/supabase/client";
import { METER_UNITS } from "@/lib/format";
import type { ReadingPoint } from "@/lib/utilities";

export type Meter = {
  id: string;
  owner_id: string;
  serial_no: string;
  type: string;
  property_id: string | null;
  folder_id: string | null;
  contract_id: string | null;
  start_value: number;
  active: boolean;
};

export type MeterReading = {
  id: string;
  meter_id: string;
  reading: number;
  read_at: string;
  source: string;
};

/** Черновик счётчика в форме договора (создаётся при сохранении). */
export type MeterDraft = {
  type: string;
  serial_no: string;
  /** Начальное показание — счётчик может быть б/у, поэтому не обязательно 0. */
  start_value: string;
};

/** Показания в виде Map<meter_id, ReadingPoint[]> для расчётных функций. */
export function groupReadingsByMeter(readings: MeterReading[]): Map<string, ReadingPoint[]> {
  const map = new Map<string, ReadingPoint[]>();
  for (const r of readings) {
    const arr = map.get(r.meter_id) ?? [];
    arr.push({ reading: Number(r.reading), read_at: r.read_at });
    map.set(r.meter_id, arr);
  }
  return map;
}

/** Последнее показание каждого счётчика. */
export function lastReadingByMeter(readings: MeterReading[]): Map<string, MeterReading> {
  const map = new Map<string, MeterReading>();
  for (const r of readings) {
    const cur = map.get(r.meter_id);
    if (!cur || r.read_at >= cur.read_at) map.set(r.meter_id, r);
  }
  return map;
}

/** Текущее значение счётчика: последнее показание либо начальное значение. */
export function meterLastValue(
  meter: Pick<Meter, "start_value">,
  last: Pick<MeterReading, "reading"> | null | undefined,
): number {
  return last ? Number(last.reading) : Number(meter.start_value);
}

/** «Арендатор (№ договора)» для списков и предпросмотров. */
export function contractDisplayLabel(
  c: { number?: string | null; tenant?: { name?: string | null } | null } | null | undefined,
): string {
  if (!c) return "—";
  const name = c.tenant?.name ?? "—";
  return c.number ? `${name} (№ ${c.number})` : name;
}

/**
 * Валидация и вставка показания. Единая точка для владельца, менеджера и
 * арендатора: source по умолчанию выводится из того, кто вносит.
 */
export async function insertMeterReading(opts: {
  meter: Pick<Meter, "id" | "owner_id" | "type">;
  lastValue: number;
  value: string;
  readAt?: string;
  source?: "owner" | "tenant";
}): Promise<void> {
  const unit = METER_UNITS[opts.meter.type] ?? "";
  const num = Number(opts.value);
  if (opts.value === "" || isNaN(num)) throw new Error("Введите показание");
  if (num < opts.lastValue)
    throw new Error(`Показание не может быть меньше предыдущего (${opts.lastValue} ${unit})`);
  const readAt = opts.readAt ?? new Date().toISOString().slice(0, 10);
  if (!readAt) throw new Error("Укажите дату");
  const { data: u } = await supabase.auth.getUser();
  const source = opts.source ?? (u.user?.id === opts.meter.owner_id ? "owner" : "tenant");
  const { error } = await supabase.from("meter_readings").insert({
    owner_id: opts.meter.owner_id,
    meter_id: opts.meter.id,
    reading: num,
    read_at: readAt,
    source: source as "owner" | "tenant",
    created_by: u.user?.id ?? null,
  });
  if (error) throw error;
}

/** Создание счётчиков, добавленных в форме договора. */
export async function insertContractMeters(opts: {
  ownerId: string;
  contractId: string;
  propertyId: string;
  drafts: MeterDraft[];
}): Promise<void> {
  if (opts.drafts.length === 0) return;
  const { error } = await supabase.from("meters").insert(
    opts.drafts.map((m) => ({
      owner_id: opts.ownerId,
      serial_no: m.serial_no.trim(),
      type: m.type as never,
      property_id: opts.propertyId,
      contract_id: opts.contractId,
      start_value: m.start_value ? Number(m.start_value) : 0,
    })),
  );
  if (error) throw error;
}
