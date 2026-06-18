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
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  active: "Активный",
  finished: "Завершён",
  terminated: "Расторгнут",
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
};