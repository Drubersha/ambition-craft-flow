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

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
