/**
 * Доменный слой дашборда: типы строк выборки, границы периода фильтра
 * и чистые расчёты (каскадная фильтрация, KPI портфеля). Без React и запросов.
 */
import { daysUntil, monthlyFromRate, monthlyPayment } from "./format";

export type Period = "day" | "month" | "quarter" | "year" | "custom";

export type Property = {
  id: string;
  name: string;
  type: string;
  status: string;
  area_total: number;
  base_rate: number | null;
  currency: string;
};

export type Contract = {
  id: string;
  number: string;
  status: string;
  kind: string;
  start_date: string;
  end_date: string | null;
  rate: number;
  area: number | null;
  payment_period: string;
  currency: string;
  property_id: string;
  tenant_id: string;
  tenant: { id: string; name: string } | null;
  property: { id: string; name: string; type: string; area_total: number } | null;
};

export type Charge = {
  id: string;
  contract_id: string;
  total: number;
  paid_total: number;
  status: string;
  due_date: string | null;
  period_start: string;
  period_end: string;
};

export type Payment = {
  id: string;
  charge_id: string;
  amount: number;
  paid_at: string;
  method: string | null;
};

export type DashboardData = {
  properties: Property[];
  contracts: Contract[];
  charges: Charge[];
  payments: Payment[];
};

/** Данные после фильтров: договоры аренды отдельно от АХЧ. */
export type FilteredDashboardData = DashboardData & { ahchContracts: Contract[] };

export function getPeriodRange(
  period: Period,
  customFrom?: string,
  customTo?: string,
): [Date, Date] {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start = new Date(now);
  switch (period) {
    case "day":
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "custom":
      if (customFrom) start = new Date(customFrom);
      if (customTo) {
        const e = new Date(customTo);
        e.setHours(23, 59, 59, 999);
        return [start, e];
      }
      break;
  }
  return [start, end];
}

export function periodLabel(p: Period) {
  return {
    day: "Сегодня",
    month: "Месяц",
    quarter: "Квартал",
    year: "Год",
    custom: "Произвольный",
  }[p];
}

/**
 * Каскадная фильтрация: объекты по выбору → договоры этих объектов
 * (АХЧ отдельно) → начисления договоров → платежи начислений.
 */
export function filterDashboardData(
  data: DashboardData | undefined,
  selected: { properties: string[]; types: string[]; statuses: string[] },
): FilteredDashboardData {
  if (!data) return { properties: [], contracts: [], charges: [], payments: [], ahchContracts: [] };
  const propIdSet = new Set(
    data.properties
      .filter(
        (p) =>
          (selected.properties.length === 0 || selected.properties.includes(p.id)) &&
          (selected.types.length === 0 || selected.types.includes(p.type)) &&
          (selected.statuses.length === 0 || selected.statuses.includes(p.status)),
      )
      .map((p) => p.id),
  );
  const properties = data.properties.filter((p) => propIdSet.has(p.id));
  const allContracts = data.contracts.filter((c) => propIdSet.has(c.property_id));
  const ahchContracts = allContracts.filter((c) => c.kind === "ahch");
  const contracts = allContracts.filter((c) => c.kind !== "ahch");
  const contractIdSet = new Set(contracts.map((c) => c.id));
  const charges = data.charges.filter((c) => contractIdSet.has(c.contract_id));
  const chargeIdSet = new Set(charges.map((c) => c.id));
  const payments = data.payments.filter((p) => chargeIdSet.has(p.charge_id));
  return { properties, contracts, charges, payments, ahchContracts };
}

/** KPI портфеля за период. Занятость считается от площади без АХЧ. */
export function computeKpi(filtered: FilteredDashboardData, periodStart: Date, periodEnd: Date) {
  const totalArea = filtered.properties.reduce((s, p) => s + Number(p.area_total || 0), 0);
  const activeContracts = filtered.contracts.filter((c) => c.status === "active");
  const activeAhch = filtered.ahchContracts.filter((c) => c.status === "active");
  const ahchArea = activeAhch.reduce((s, c) => s + Number(c.area || 0), 0);
  const ahchShare = totalArea > 0 ? (ahchArea / totalArea) * 100 : 0;
  const leasedArea = activeContracts.reduce((s, c) => s + Number(c.area || 0), 0);
  const usableArea = totalArea - ahchArea;
  const occupancy = usableArea > 0 ? (leasedArea / usableArea) * 100 : 0;

  const periodPayments = filtered.payments.filter((p) => {
    const d = new Date(p.paid_at);
    return d >= periodStart && d <= periodEnd;
  });
  const rentIncome = periodPayments.reduce((s, p) => s + Number(p.amount), 0);

  const ratesWeighted = activeContracts.reduce(
    (acc, c) => {
      const monthly = monthlyFromRate(Number(c.rate), c.payment_period);
      const area = Number(c.area || 0);
      acc.num += monthly * area;
      acc.den += area;
      return acc;
    },
    { num: 0, den: 0 },
  );
  const avgRate = ratesWeighted.den > 0 ? ratesWeighted.num / ratesWeighted.den : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueAmt = filtered.charges.reduce((s, c) => {
    if (!c.due_date) return s;
    const remain = Number(c.total) - Number(c.paid_total);
    if (remain <= 0) return s;
    const days = Math.floor((today.getTime() - new Date(c.due_date).getTime()) / 86400000);
    return days > 30 ? s + remain : s;
  }, 0);

  const expSoon = activeContracts.filter((c) => {
    const d = daysUntil(c.end_date);
    return d !== null && d >= 0 && d <= 90;
  }).length;

  const monthlyIncome = activeContracts.reduce((s, c) => {
    return s + monthlyPayment(Number(c.rate), c.payment_period, Number(c.area || 0));
  }, 0);

  return {
    totalArea,
    propsCount: filtered.properties.length,
    occupancy,
    rentIncome,
    avgRate,
    overdueAmt,
    expSoon,
    monthlyIncome,
    ahchArea,
    ahchShare,
  };
}

/** Тон подсветки занятости: ≥90 — ok, ≥70 — warn, ниже — danger. */
export function occupancyTone(v: number): "ok" | "warn" | "danger" {
  if (v >= 90) return "ok";
  if (v >= 70) return "warn";
  return "danger";
}

/** CSS-класс текста для тона KPI. */
export function toneClass(t?: "ok" | "warn" | "danger") {
  if (t === "ok") return "text-success";
  if (t === "warn") return "text-warning";
  if (t === "danger") return "text-destructive";
  return "";
}
