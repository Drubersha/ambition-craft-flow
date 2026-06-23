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

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Текущий период плана. Если today до reset_day этого месяца, период
 * начался в предыдущем месяце. period_end = день перед reset_day следующего цикла.
 */
export function getCurrentPeriod(resetDay: number, today: Date = new Date()): { start: string; end: string } {
  const day = Math.max(1, Math.min(28, Math.floor(resetDay) || 1));
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const start = d >= day ? new Date(y, m, day) : new Date(y, m - 1, day);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day - 1);
  return { start: toISO(start), end: toISO(end) };
}

export function formatPeriod(period: { start: string; end: string }): string {
  const fmt = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  return `${fmt(period.start)} — ${fmt(period.end)}`;
}