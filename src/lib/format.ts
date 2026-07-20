export function formatMoney(v: number | string | null | undefined, currency = "RUB") {
  const n = Number(v ?? 0);
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function formatDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Дата в формате YYYY-MM-DD по локальному времени. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Сегодня в формате YYYY-MM-DD (по UTC — как new Date().toISOString()). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ключ месяца "YYYY-MM" для даты. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Ключ месяца "YYYY-MM" из ISO-строки даты. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Ключи месяцев "YYYY-MM" между двумя датами включительно. */
export function monthKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    keys.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

/** "2026-07" → "июл 2026" (year: "2-digit" — "июл 26") для подписей осей. */
export function formatMonthKey(key: string, year: "numeric" | "2-digit" = "numeric"): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("ru-RU", { month: "short", year });
}

/** Целое число с разделителями тысяч (ru-RU). */
export function formatNum(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));
}

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  office: "Офис",
  warehouse: "Склад",
  retail: "Торговая площадь",
  production: "Производство",
  coworking: "Коворкинг",
  other: "Другое",
};

export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  free: "Свободно",
  occupied: "Занято",
  partial: "Частично",
  maintenance: "Ремонт",
  archived: "Архив",
  ahch: "АХЧ",
  partial_ahch: "Частично АХЧ",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  active: "Активный",
  finished: "Завершён",
  terminated: "Расторгнут",
};

export const CONTRACT_KIND_LABELS: Record<string, string> = {
  rent: "Аренда",
  ahch: "АХЧ (собств. нужды)",
};

export const PAYMENT_PERIOD_LABELS: Record<string, string> = {
  monthly: "Ежемесячно",
  quarterly: "Ежеквартально",
  yearly: "Ежегодно",
  one_time: "Разово",
};

export const METER_TYPE_LABELS: Record<string, string> = {
  electricity: "Электричество",
  water_cold: "Холодная вода",
  water_hot: "Горячая вода",
  gas: "Газ",
  heat: "Отопление",
};

export const METER_UNITS: Record<string, string> = {
  electricity: "кВт·ч",
  water_cold: "м³",
  water_hot: "м³",
  gas: "м³",
  heat: "Гкал",
};

export const UTILITY_PERIOD_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  allocated: "Распределён",
};

export const CHARGE_STATUS_LABELS: Record<string, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
  overdue: "Просрочен",
};

export const TENANT_KIND_LABELS: Record<string, string> = {
  person: "Физлицо",
  company: "Компания",
  own_company: "Собственная компания",
  owner_friends: "Друзья собственника",
};

export function monthlyFromRate(rate: number, period: string): number {
  switch (period) {
    case "quarterly":
      return rate / 3;
    case "yearly":
      return rate / 12;
    default:
      return rate;
  }
}

export function computeDeposit(rate: number, period: string, percent: number): number {
  return Math.round(monthlyFromRate(rate, period) * (percent || 0)) / 100;
}

/** Monthly payment = price per sqm (normalized to monthly) × area. */
export function monthlyPayment(rate: number, period: string, area: number): number {
  return monthlyFromRate(rate, period) * (area || 0);
}

export function computeDepositWithArea(
  rate: number,
  period: string,
  area: number,
  percent: number,
): number {
  return Math.round(monthlyPayment(rate, period, area) * (percent || 0)) / 100;
}

/** Number of months covered by an inclusive date range (min 1). */
export function monthsInRange(start: string, end: string): number {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  return Math.max(1, months);
}

export function chargeTotalForPeriod(
  rate: number,
  period: string,
  start: string,
  end: string,
  area = 1,
): number {
  if (period === "one_time") return Math.round(rate * (area || 1) * 100) / 100;
  const monthly = monthlyFromRate(rate, period) * (area || 0);
  return Math.round(monthly * monthsInRange(start, end) * 100) / 100;
}

/**
 * Разбивает интервал [startDate; today] на отрезки по payment_period:
 *  - monthly   → календарные месяцы
 *  - quarterly → календарные кварталы
 *  - yearly    → календарные годы
 *  - one_time  → один отрезок [start; endDate ?? today]
 * Если endDate задана и попадает внутрь отрезка, period_end подрезается.
 * Возвращает массив {period_start, period_end} в формате YYYY-MM-DD.
 */
export function splitContractPeriods(
  startDate: string,
  endDate: string | null | undefined,
  period: string,
  today: Date = new Date(),
): { period_start: string; period_end: string }[] {
  if (!startDate) return [];
  const start = new Date(startDate);
  const hardEnd = endDate ? new Date(endDate) : null;
  const upTo = hardEnd && hardEnd < today ? hardEnd : today;
  if (start > upTo) return [];

  if (period === "one_time") {
    return [{ period_start: toISO(start), period_end: toISO(hardEnd ?? today) }];
  }

  const out: { period_start: string; period_end: string }[] = [];
  let cursor: Date;
  let step: (d: Date) => Date;
  let periodEnd: (d: Date) => Date;

  if (period === "yearly") {
    cursor = new Date(start.getFullYear(), 0, 1);
    step = (d) => new Date(d.getFullYear() + 1, 0, 1);
    periodEnd = (d) => new Date(d.getFullYear(), 11, 31);
  } else if (period === "quarterly") {
    const q = Math.floor(start.getMonth() / 3);
    cursor = new Date(start.getFullYear(), q * 3, 1);
    step = (d) => new Date(d.getFullYear(), d.getMonth() + 3, 1);
    periodEnd = (d) => new Date(d.getFullYear(), d.getMonth() + 3, 0);
  } else {
    // monthly
    cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    step = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
    periodEnd = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  while (cursor <= upTo) {
    const ps = cursor < start ? start : cursor;
    let pe = periodEnd(cursor);
    if (hardEnd && pe > hardEnd) pe = hardEnd;
    if (pe > upTo) pe = upTo;
    if (ps <= pe) out.push({ period_start: toISO(ps), period_end: toISO(pe) });
    cursor = step(cursor);
  }
  return out;
}
