/** Доходы, расходы и прибыль: карточки за период/год и помесячный график. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PiggyBank, TrendingDown, Wallet } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMonthKey, monthKeyOf, monthKeysBetween } from "@/lib/format";
import { computeProfitVsPlan, plannedForMonths } from "@/lib/budget";

export function ProfitSummary({ periodStart, periodEnd }: { periodStart: Date; periodEnd: Date }) {
  const { data } = useQuery({
    queryKey: ["dashboard-budget"],
    queryFn: async () => {
      const [py, ex, plans, cats, limits] = await Promise.all([
        supabase.from("payments").select("amount, paid_at"),
        supabase.from("budget_expenses").select("amount, spent_at"),
        supabase.from("budget_plans").select("id, revenue_plan_monthly, vat_rate"),
        supabase.from("budget_categories").select("id, plan_id, limit_amount"),
        supabase
          .from("budget_period_limits")
          .select("plan_id, category_id, period_start, limit_amount"),
      ]);
      if (py.error) throw py.error;
      if (ex.error) throw ex.error;
      if (plans.error) throw plans.error;
      if (cats.error) throw cats.error;
      if (limits.error) throw limits.error;
      return {
        payments: py.data ?? [],
        expenses: ex.data ?? [],
        plans: plans.data ?? [],
        categories: cats.data ?? [],
        periodLimits: limits.data ?? [],
      };
    },
  });
  // «За период» — выбранный сверху период; «за год» — календарный год его конца.
  const y = periodEnd.getFullYear();
  const inPeriod = (s: string) => {
    const d = new Date(s);
    return d >= periodStart && d <= periodEnd;
  };
  const inYear = (s: string) => new Date(s).getFullYear() === y;

  const sumBy = (
    arr: { amount: number | string; spent_at?: string; paid_at?: string }[],
    field: "spent_at" | "paid_at",
    pred: (s: string) => boolean,
  ) => arr.reduce((s, r) => (pred((r as any)[field]) ? s + Number(r.amount || 0) : s), 0);

  const incomeMonth = sumBy((data?.payments ?? []) as any, "paid_at", inPeriod);
  const expenseMonth = sumBy((data?.expenses ?? []) as any, "spent_at", inPeriod);

  const profitColor = (v: number) => (v < 0 ? "text-destructive" : "text-foreground");

  // При периоде от двух месяцев — помесячная разбивка доход/расход/прибыль.
  const monthKeys = monthKeysBetween(periodStart, periodEnd);

  // Прибыль считаем как в «Отчёте о выполнении бюджета»: выручка без НДС
  // минус расходы, и отдельно — насколько это выше плановой прибыли.
  const profit = useMemo(() => {
    const plans = (data?.plans ?? []) as any[];
    const revenuePlanMonthly = plans.reduce((s, p) => s + Number(p.revenue_plan_monthly || 0), 0);
    // Ставка НДС общая для всех планов владельца: берём первую заданную.
    const vatRate = Number(plans.find((p) => Number(p.vat_rate) > 0)?.vat_rate ?? 0);
    const expensePlan = plans.reduce((s, p) => {
      const cats = ((data?.categories ?? []) as any[])
        .filter((c) => c.plan_id === p.id)
        .map((c) => ({ id: c.id, limit_amount: Number(c.limit_amount || 0) }));
      const limits = ((data?.periodLimits ?? []) as any[]).filter((l) => l.plan_id === p.id);
      return s + plannedForMonths(monthKeys, cats, limits);
    }, 0);
    return computeProfitVsPlan({
      revenueGross: incomeMonth,
      expenses: expenseMonth,
      months: monthKeys.length,
      revenuePlanMonthly,
      expensePlan,
      vatRate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, incomeMonth, expenseMonth, monthKeys.join(",")]);
  const monthlyRows = useMemo(() => {
    if (monthKeys.length < 2 || !data) return [];
    const income = new Map<string, number>();
    const expense = new Map<string, number>();
    for (const p of data.payments as any[]) {
      const d = new Date(p.paid_at);
      if (d < periodStart || d > periodEnd) continue;
      const k = monthKeyOf(p.paid_at);
      income.set(k, (income.get(k) ?? 0) + Number(p.amount || 0));
    }
    for (const e of data.expenses as any[]) {
      const d = new Date(e.spent_at);
      if (d < periodStart || d > periodEnd) continue;
      const k = monthKeyOf(e.spent_at);
      expense.set(k, (expense.get(k) ?? 0) + Number(e.amount || 0));
    }
    return monthKeys.map((k) => {
      const inc = Math.round(income.get(k) ?? 0);
      const exp = Math.round(expense.get(k) ?? 0);
      return { month: formatMonthKey(k, "2-digit"), Доход: inc, Расход: exp, Прибыль: inc - exp };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, periodStart, periodEnd, monthKeys.join(",")]);

  return (
    <div className="space-y-4">
      {monthlyRows.length >= 2 && (
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Доходы, расходы и прибыль по месяцам</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <ComposedChart data={monthlyRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RTooltip formatter={(v: any) => formatMoney(Number(v))} />
                  <Legend />
                  <Bar dataKey="Доход" fill="var(--success)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Расход" fill="var(--destructive)" radius={[3, 3, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="Прибыль"
                    stroke="var(--info)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span>Выручка без НДС</span>
            </div>
            <div className="mt-0.5 text-xl sm:text-2xl font-bold break-words">
              {formatMoney(profit.revenueNet)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Поступило {formatMoney(profit.revenueGross)} с НДС
              {profit.revenuePlan !== null && ` · план ${formatMoney(profit.revenuePlan)}`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              <span>Расходы за период</span>
            </div>
            <div className="mt-0.5 text-base sm:text-lg font-bold break-words">
              {formatMoney(profit.expenses)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              План {formatMoney(profit.expensePlan)}
              {profit.expensePlan > 0 &&
                ` · ${profit.expenses > profit.expensePlan ? "перерасход" : "экономия"} ${formatMoney(Math.abs(profit.expenses - profit.expensePlan))}`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <PiggyBank className="h-4 w-4" />
              <span>Выручка минус расходы</span>
            </div>
            <div
              className={`mt-0.5 text-base sm:text-lg font-bold break-words ${profitColor(profit.profit)}`}
            >
              {formatMoney(profit.profit)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {profit.profitPlan === null
                ? "План выручки не задан"
                : `План ${formatMoney(profit.profitPlan)}`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <PiggyBank className="h-4 w-4" />
              <span>Прибыль сверх плана</span>
            </div>
            <div
              className={`mt-0.5 text-base sm:text-lg font-bold break-words ${
                profit.overPlan === null ? "" : profitColor(profit.overPlan)
              }`}
            >
              {profit.overPlan === null ? "—" : formatMoney(profit.overPlan)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {profit.overPlan === null || profit.profitPlan === null || profit.profitPlan === 0
                ? "Задайте план выручки в разделе «Бюджет»"
                : `${((profit.overPlan / Math.abs(profit.profitPlan)) * 100).toFixed(1)}% к плановой прибыли`}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
