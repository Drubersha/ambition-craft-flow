/**
 * Чистые расчёты для блока коммунальных услуг: расход по показаниям,
 * распределение общих затрат по договорам (компенсация), сезонная база
 * для алертов. Зеркалит логику SQL-триггера trg_meter_reading_alert —
 * менять пороги и окна синхронно.
 */

import { monthKey, toISO } from "./format";

export type ReadingPoint = { reading: number; read_at: string };

export type ConsumptionInterval = { start: string; end: string; consumption: number };

/** Порог алерта: отклонение суточного расхода от базы (доля, 0.3 = 30%). */
export const UTILITY_ALERT_THRESHOLD = 0.3;

function dayMs(v: string): number {
  const d = new Date(v);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Дней между датами (включительно-невключительно, минимум 0). */
export function daysBetween(start: string, end: string): number {
  return Math.max(0, Math.round((dayMs(end) - dayMs(start)) / 86_400_000));
}

/**
 * Пересечение срока аренды с расчётным периодом в днях (обе границы
 * включительно). Для досрочного выезда contractEnd режет период.
 */
export function daysOverlap(
  contractStart: string,
  contractEnd: string | null | undefined,
  periodStart: string,
  periodEnd: string,
): number {
  const s = Math.max(dayMs(contractStart), dayMs(periodStart));
  const e = Math.min(contractEnd ? dayMs(contractEnd) : Infinity, dayMs(periodEnd));
  if (e < s) return 0;
  return Math.round((e - s) / 86_400_000) + 1;
}

function sortedReadings(readings: ReadingPoint[]): ReadingPoint[] {
  return [...readings].sort((a, b) => a.read_at.localeCompare(b.read_at));
}

/** Значение счётчика на дату: последнее показание ≤ даты, иначе start_value. */
export function valueAt(startValue: number, readings: ReadingPoint[], date: string): number {
  let v = startValue;
  for (const r of sortedReadings(readings)) {
    if (dayMs(r.read_at) <= dayMs(date)) v = Number(r.reading);
    else break;
  }
  return v;
}

/**
 * Расход за период [start; end]. null — если по счётчику нет ни одного
 * показания внутри или после периода (нечего считать). Отрицательный расход
 * (замена счётчика без новой карточки) обрезается до 0.
 */
export function consumptionForPeriod(
  startValue: number,
  readings: ReadingPoint[],
  periodStart: string,
  periodEnd: string,
): number | null {
  const sorted = sortedReadings(readings);
  const hasEndData = sorted.some((r) => dayMs(r.read_at) > dayMs(periodStart));
  if (!hasEndData) return null;
  const startVal = valueAt(startValue, sorted, periodStart);
  const endVal = valueAt(startValue, sorted, periodEnd);
  return Math.max(0, Math.round((endVal - startVal) * 1000) / 1000);
}

export type AllocationEntry = {
  contractId: string;
  meterId?: string | null;
  /** Расход по счётчику арендатора за период; null — счётчика/данных нет. */
  consumption: number | null;
  /** Площадь по договору, м². */
  area: number;
  /** Дней аренды внутри периода (досрочный выезд → меньше дней). */
  days: number;
};

export type AllocationResult = {
  contractId: string;
  meterId: string | null;
  consumption: number | null;
  amount: number;
  method: "by_meter" | "by_area" | "mixed";
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Распределение общего счёта за услугу по договорам.
 *
 * meters_then_area (по умолчанию):
 *   тариф = общий счёт / базовый расход (показания общих счётчиков
 *   арендодателя, иначе сумма расходов арендаторских счётчиков);
 *   арендаторы со счётчиками платят расход × тариф, остаток (МОП, потери,
 *   арендаторы без счётчиков) — пропорционально м²·дни.
 * by_area: всё пропорционально м²·дни.
 */
export function allocateUtilityCosts(opts: {
  totalAmount: number;
  entries: AllocationEntry[];
  commonConsumption?: number | null;
  mode?: "meters_then_area" | "by_area";
}): AllocationResult[] {
  const { totalAmount, entries, commonConsumption, mode = "meters_then_area" } = opts;
  if (entries.length === 0) return [];

  const weights = entries.map((e) => Math.max(0, e.area) * Math.max(0, e.days));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const byAreaShare = (i: number, amount: number) =>
    weightSum > 0 ? (amount * weights[i]) / weightSum : amount / entries.length;

  const metered = entries.filter((e) => e.consumption != null && e.consumption >= 0);
  const useMeters = mode === "meters_then_area" && metered.length > 0 && totalAmount > 0;

  let results: AllocationResult[];
  let expectExactTotal = true;

  if (!useMeters) {
    results = entries.map((e, i) => ({
      contractId: e.contractId,
      meterId: e.meterId ?? null,
      consumption: e.consumption,
      amount: round2(byAreaShare(i, totalAmount)),
      method: "by_area" as const,
    }));
  } else {
    const meteredSum = metered.reduce((s, e) => s + (e.consumption as number), 0);
    const base = commonConsumption && commonConsumption > 0 ? commonConsumption : meteredSum;
    const tariff = base > 0 ? totalAmount / base : 0;
    const meteredAmounts = entries.map((e) =>
      e.consumption != null && e.consumption >= 0 ? e.consumption * tariff : 0,
    );
    const meteredTotal = meteredAmounts.reduce((s, a) => s + a, 0);
    // Если арендаторские счётчики насчитали больше общего счёта (утечка в
    // данных), остатка нет и суммы превысят счёт — это сигнал владельцу.
    const remainder = Math.max(0, totalAmount - meteredTotal);
    expectExactTotal = meteredTotal <= totalAmount + 0.005;
    results = entries.map((e, i) => {
      const fromMeter = meteredAmounts[i];
      const fromArea = byAreaShare(i, remainder);
      const hasMeter = e.consumption != null && e.consumption >= 0;
      return {
        contractId: e.contractId,
        meterId: e.meterId ?? null,
        consumption: e.consumption,
        amount: round2(fromMeter + fromArea),
        method: (hasMeter && fromArea > 0.005
          ? "mixed"
          : hasMeter
            ? "by_meter"
            : "by_area") as AllocationResult["method"],
      };
    });
  }

  // Подгоняем копеечный дрейф округления, чтобы суммы сходились со счётом.
  if (expectExactTotal && results.length > 0) {
    const sum = round2(results.reduce((s, r) => s + r.amount, 0));
    const diff = round2(totalAmount - sum);
    if (diff !== 0 && Math.abs(diff) <= 0.05) {
      const idx = results.reduce((best, r, i) => (r.amount > results[best].amount ? i : best), 0);
      results[idx] = { ...results[idx], amount: round2(results[idx].amount + diff) };
    }
  }
  return results;
}

/** Интервалы расхода между соседними показаниями (нулевая точка — start_value). */
export function buildIntervals(
  startValue: number,
  readings: ReadingPoint[],
): ConsumptionInterval[] {
  const out: ConsumptionInterval[] = [];
  let prevVal = startValue;
  let prevDate: string | null = null;
  for (const p of sortedReadings(readings)) {
    if (prevDate && p.read_at > prevDate) {
      out.push({
        start: prevDate,
        end: p.read_at,
        consumption: Math.max(0, Number(p.reading) - prevVal),
      });
    }
    prevVal = Number(p.reading);
    prevDate = p.read_at;
  }
  return out;
}

export type IntervalAnalysis = {
  current: ConsumptionInterval | null;
  currentDaily: number | null;
  baseline: number | null;
  anomalous: boolean;
};

/** Последний интервал показаний счётчика против сезонной базы (для аналитики). */
export function analyzeLastInterval(
  startValue: number,
  readings: ReadingPoint[],
): IntervalAnalysis {
  const intervals = buildIntervals(startValue, readings);
  const current = intervals[intervals.length - 1] ?? null;
  if (!current) return { current: null, currentDaily: null, baseline: null, anomalous: false };
  const baseline = seasonalBaselineDaily(intervals.slice(0, -1), current);
  const currentDaily = dailyRate(current);
  return { current, currentDaily, baseline, anomalous: isAnomalous(currentDaily, baseline) };
}

/** Средний суточный расход интервала. */
export function dailyRate(interval: ConsumptionInterval): number {
  const days = Math.max(1, daysBetween(interval.start, interval.end));
  return interval.consumption / days;
}

/**
 * Сезонная база суточного расхода для интервала current:
 * 1) интервалы, чья середина попадает в окно ±windowDays вокруг той же даты
 *    год назад (взвешенно по дням);
 * 2) иначе — последние 3 интервала перед current.
 * null — данных нет.
 */
export function seasonalBaselineDaily(
  intervals: ConsumptionInterval[],
  current: ConsumptionInterval,
  windowDays = 45,
): number | null {
  const mid = (i: ConsumptionInterval) => (dayMs(i.start) + dayMs(i.end)) / 2;
  const past = intervals.filter((i) => dayMs(i.end) <= dayMs(current.start));
  const target = mid(current) - 365 * 86_400_000;
  const win = windowDays * 86_400_000;
  const weighted = (list: ConsumptionInterval[]): number | null => {
    const days = list.reduce((s, i) => s + Math.max(1, daysBetween(i.start, i.end)), 0);
    if (days <= 0) return null;
    const consumption = list.reduce((s, i) => s + i.consumption, 0);
    return consumption / days;
  };
  const seasonal = past.filter((i) => Math.abs(mid(i) - target) <= win);
  if (seasonal.length > 0) return weighted(seasonal);
  const recent = [...past].sort((a, b) => b.end.localeCompare(a.end)).slice(0, 3);
  if (recent.length === 0) return null;
  return weighted(recent);
}

export function isAnomalous(
  currentDaily: number,
  baselineDaily: number | null,
  threshold = UTILITY_ALERT_THRESHOLD,
): boolean {
  if (baselineDaily == null || baselineDaily <= 0) return false;
  return Math.abs(currentDaily - baselineDaily) / baselineDaily >= threshold;
}

/**
 * Помесячный расход по показаниям (для графиков). Расход каждого интервала
 * между соседними показаниями распределяется по месяцам пропорционально дням.
 * Возвращает последние monthsBack месяцев в порядке возрастания: [{month:"YYYY-MM"}].
 */
export function monthlyConsumption(
  readings: ReadingPoint[],
  monthsBack: number,
  today: Date = new Date(),
): { month: string; consumption: number }[] {
  const sorted = sortedReadings(readings);
  const byMonth = new Map<string, number>();
  for (let k = 1; k < sorted.length; k++) {
    const a = sorted[k - 1];
    const b = sorted[k];
    const totalDays = daysBetween(a.read_at, b.read_at);
    const consumption = Math.max(0, Number(b.reading) - Number(a.reading));
    if (totalDays <= 0) continue;
    // Идём по месяцам интервала (a; b].
    let cursor = dayMs(a.read_at);
    const endMs = dayMs(b.read_at);
    while (cursor < endMs) {
      const d = new Date(cursor);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const sliceEnd = Math.min(monthEnd, endMs);
      const sliceDays = Math.round((sliceEnd - cursor) / 86_400_000);
      const key = monthKey(d);
      byMonth.set(key, (byMonth.get(key) ?? 0) + (consumption * sliceDays) / totalDays);
      cursor = sliceEnd;
    }
  }
  const out: { month: string; consumption: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = monthKey(d);
    out.push({ month: key, consumption: Math.round((byMonth.get(key) ?? 0) * 100) / 100 });
  }
  return out;
}

export type AllocationMeter = {
  id: string;
  type: string;
  folder_id: string | null;
  contract_id: string | null;
  start_value: number;
};

export type AllocationContract = {
  id: string;
  area: number | string | null;
  start_date: string;
  end_date: string | null;
};

export type AllocationPreview = {
  allocations: AllocationResult[];
  commonConsumption: number;
};

/**
 * Предпросмотр распределения общего счёта за услугу по договорам папки:
 * расход каждого договора — сумма по его счётчикам данной услуги, базовый
 * расход — показания общих счётчиков папки. Чистая функция поверх
 * allocateUtilityCosts. null — данных недостаточно.
 */
export function computeAllocationPreview(opts: {
  totalAmount: number;
  mode: "meters_then_area" | "by_area";
  service: string;
  folderId: string;
  periodStart: string;
  periodEnd: string;
  meters: AllocationMeter[];
  /** Договоры папки, уже отфильтрованные по пересечению с периодом. */
  contracts: AllocationContract[];
  readingsByMeter: Map<string, ReadingPoint[]>;
}): AllocationPreview | null {
  const { totalAmount, contracts, service, folderId, periodStart, periodEnd } = opts;
  if (!folderId || contracts.length === 0) return null;
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;

  const serviceMeters = opts.meters.filter((m) => m.type === service);
  const meterConsumption = (m: AllocationMeter) =>
    consumptionForPeriod(
      Number(m.start_value),
      opts.readingsByMeter.get(m.id) ?? [],
      periodStart,
      periodEnd,
    );

  const commonConsumption = serviceMeters
    .filter((m) => m.folder_id === folderId)
    .reduce((s, m) => s + (meterConsumption(m) ?? 0), 0);

  const entries: AllocationEntry[] = contracts.map((c) => {
    let consumption: number | null = null;
    let meterId: string | null = null;
    for (const m of serviceMeters.filter((x) => x.contract_id === c.id)) {
      const v = meterConsumption(m);
      if (v != null) {
        consumption = (consumption ?? 0) + v;
        meterId = m.id;
      }
    }
    return {
      contractId: c.id,
      meterId,
      consumption,
      area: Number(c.area) || 0,
      days: daysOverlap(c.start_date, c.end_date, periodStart, periodEnd),
    };
  });

  const allocations = allocateUtilityCosts({
    totalAmount,
    entries,
    commonConsumption: commonConsumption > 0 ? commonConsumption : null,
    mode: opts.mode,
  });
  return { allocations, commonConsumption };
}

/** Прошлый календарный месяц [1-е; последнее число] — дефолт расчётного периода. */
export function prevMonthRange(today: Date = new Date()): { start: string; end: string } {
  return {
    start: toISO(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    end: toISO(new Date(today.getFullYear(), today.getMonth(), 0)),
  };
}
