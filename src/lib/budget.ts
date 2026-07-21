import { toISO } from "./format";

export type BudgetPlan = {
  id: string;
  owner_id: string;
  folder_id: string;
  reset_day: number;
  warning_percent: number;
  currency: string;
};

export type BudgetCategory = {
  id: string;
  plan_id: string;
  name: string;
  limit_amount: number;
  sort_order: number;
};

export type BudgetExpense = {
  id: string;
  plan_id: string;
  category_id: string;
  amount: number;
  spent_at: string;
  note: string | null;
  period_start: string;
  period_end: string;
  archived: boolean;
};

/** Per-period override of a category limit (past periods analytics). */
export type BudgetPeriodLimit = {
  id: string;
  plan_id: string;
  category_id: string;
  period_start: string;
  limit_amount: number;
};

/**
 * Плановая сумма расходов за диапазон месяцев.
 *
 * Лимит категории — месячный, но по месяцам он меняется (в отчёте 1С
 * коммуналка идёт 550 000 в январе и 130 000 в июле). Поэтому для каждого
 * месяца берётся персональный лимит из budget_period_limits, а базовый
 * limit_amount используется только там, где персонального нет. Умножать один
 * лимит на число месяцев нельзя — план разойдётся с официальным отчётом.
 *
 * `months` — ключи месяцев «YYYY-MM» внутри выбранного периода.
 */
export function plannedForMonths(
  months: string[],
  categories: { id: string; limit_amount: number }[],
  periodLimits: { category_id: string; period_start: string; limit_amount: number }[],
): number {
  const byMonth = new Map<string, Map<string, number>>();
  for (const l of periodLimits) {
    const key = String(l.period_start).slice(0, 7);
    const m = byMonth.get(key) ?? new Map<string, number>();
    m.set(l.category_id, Number(l.limit_amount) || 0);
    byMonth.set(key, m);
  }
  let total = 0;
  for (const month of months) {
    const overrides = byMonth.get(month);
    for (const c of categories) {
      const override = overrides?.get(c.id);
      total += override !== undefined ? override : Number(c.limit_amount) || 0;
    }
  }
  return total;
}

export type ProfitVsPlan = {
  /** Поступления как есть, с НДС. */
  revenueGross: number;
  /** Выручка без НДС — сопоставима с планом. */
  revenueNet: number;
  /** Фактические расходы за период. */
  expenses: number;
  /** Выручка без НДС минус расходы. */
  profit: number;
  /** Плановая выручка за период (без НДС); null — план не задан. */
  revenuePlan: number | null;
  /** Плановые расходы за период. */
  expensePlan: number;
  /** Плановая прибыль; null, если план выручки не задан. */
  profitPlan: number | null;
  /** Прибыль сверх плана; null, если план выручки не задан. */
  overPlan: number | null;
};

/**
 * Прибыль по методике «Отчёта о выполнении бюджета» (1С):
 * выручка без НДС − расходы, и сверх плана — то же за вычетом плановой прибыли.
 *
 * Поступления приходят с НДС, план задан без НДС, поэтому факт приводится к
 * виду плана по ставке. Признака «работает с НДС» у арендаторов в системе нет,
 * поэтому ставка применяется ко всем поступлениям и цифра приблизительная:
 * в отчёте 1С фактическое соотношение гуляет от 1.10 до 1.20 при плановых 1.22.
 */
export function computeProfitVsPlan(args: {
  revenueGross: number;
  expenses: number;
  months: number;
  revenuePlanMonthly: number;
  expensePlan: number;
  vatRate: number;
}): ProfitVsPlan {
  const { revenueGross, expenses, months, revenuePlanMonthly, expensePlan, vatRate } = args;
  const divisor = 1 + (Number(vatRate) || 0) / 100;
  const revenueNet = divisor > 0 ? revenueGross / divisor : revenueGross;
  const profit = revenueNet - expenses;
  const hasRevenuePlan = revenuePlanMonthly > 0 && months > 0;
  const revenuePlan = hasRevenuePlan ? revenuePlanMonthly * months : null;
  const profitPlan = revenuePlan === null ? null : revenuePlan - expensePlan;
  return {
    revenueGross,
    revenueNet,
    expenses,
    profit,
    revenuePlan,
    expensePlan,
    profitPlan,
    overPlan: profitPlan === null ? null : profit - profitPlan,
  };
}

/**
 * Текущий период плана. Если today до reset_day этого месяца, период
 * начался в предыдущем месяце. period_end = день перед reset_day следующего цикла.
 */
export function getCurrentPeriod(
  resetDay: number,
  today: Date = new Date(),
): { start: string; end: string } {
  const day = Math.max(1, Math.min(28, Math.floor(resetDay) || 1));
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const start = d >= day ? new Date(y, m, day) : new Date(y, m - 1, day);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day - 1);
  return { start: toISO(start), end: toISO(end) };
}

/**
 * Период, которому принадлежит дата anchor (по тем же правилам, что
 * getCurrentPeriod). Нужен для перечисления прошлых периодов.
 */
export function getPeriodFor(resetDay: number, anchor: Date): { start: string; end: string } {
  return getCurrentPeriod(resetDay, anchor);
}

/**
 * Список периодов для выбора: текущий + count прошлых (по текущему reset_day),
 * дополненный периодами, реально встречающимися в расходах (на случай, если
 * reset_day менялся и старые границы не совпадают с расчётными).
 */
export function listSelectablePeriods(
  resetDay: number,
  expenses: Pick<BudgetExpense, "period_start" | "period_end">[],
  count = 12,
  today: Date = new Date(),
): { start: string; end: string }[] {
  const byStart = new Map<string, { start: string; end: string }>();
  const current = getCurrentPeriod(resetDay, today);
  byStart.set(current.start, current);
  const day = Math.max(1, Math.min(28, Math.floor(resetDay) || 1));
  const first = new Date(current.start);
  for (let i = 1; i <= count; i++) {
    const start = new Date(first.getFullYear(), first.getMonth() - i, day);
    const p = getPeriodFor(resetDay, start);
    byStart.set(p.start, p);
  }
  for (const e of expenses) {
    if (!byStart.has(e.period_start)) {
      byStart.set(e.period_start, { start: e.period_start, end: e.period_end });
    }
  }
  return Array.from(byStart.values()).sort((a, b) => b.start.localeCompare(a.start));
}

export function formatPeriod(period: { start: string; end: string }): string {
  const fmt = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  return `${fmt(period.start)} — ${fmt(period.end)}`;
}
