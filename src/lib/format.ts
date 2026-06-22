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
    case "quarterly": return rate / 3;
    case "yearly": return rate / 12;
    default: return rate;
  }
}

export function computeDeposit(rate: number, period: string, percent: number): number {
  return Math.round(monthlyFromRate(rate, period) * (percent || 0)) / 100;
}

/** Monthly payment = price per sqm (normalized to monthly) × area. */
export function monthlyPayment(rate: number, period: string, area: number): number {
  return monthlyFromRate(rate, period) * (area || 0);
}

export function computeDepositWithArea(rate: number, period: string, area: number, percent: number): number {
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

export function chargeTotalForPeriod(rate: number, period: string, start: string, end: string, area = 1): number {
  if (period === "one_time") return Math.round(rate * (area || 1) * 100) / 100;
  const monthly = monthlyFromRate(rate, period) * (area || 0);
  return Math.round(monthly * monthsInRange(start, end) * 100) / 100;
}