/** Доходы, расходы и прибыль: карточки за период/год и помесячный график. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PiggyBank, TrendingDown } from "lucide-react";
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

export function ProfitSummary({ periodStart, periodEnd }: { periodStart: Date; periodEnd: Date }) {
  const { data } = useQuery({
    queryKey: ["dashboard-budget"],
    queryFn: async () => {
      const [py, ex] = await Promise.all([
        supabase.from("payments").select("amount, paid_at"),
        supabase.from("budget_expenses").select("amount, spent_at"),
      ]);
      if (py.error) throw py.error;
      if (ex.error) throw ex.error;
      return { payments: py.data ?? [], expenses: ex.data ?? [] };
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
  const incomeYear = sumBy((data?.payments ?? []) as any, "paid_at", inYear);
  const expenseMonth = sumBy((data?.expenses ?? []) as any, "spent_at", inPeriod);
  const expenseYear = sumBy((data?.expenses ?? []) as any, "spent_at", inYear);
  const profitMonth = incomeMonth - expenseMonth;
  const profitYear = incomeYear - expenseYear;
  const marginMonth = incomeMonth > 0 ? (profitMonth / incomeMonth) * 100 : null;
  const marginYear = incomeYear > 0 ? (profitYear / incomeYear) * 100 : null;

  const profitColor = (v: number) => (v < 0 ? "text-destructive" : "text-foreground");

  // При периоде от двух месяцев — помесячная разбивка доход/расход/прибыль.
  const monthKeys = monthKeysBetween(periodStart, periodEnd);
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
              <TrendingDown className="h-4 w-4" />
              <span>Расходы за период</span>
            </div>
            <div className="mt-0.5 text-base sm:text-lg font-bold break-words">
              {formatMoney(expenseMonth)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              <span>Расходы за {periodEnd.getFullYear()} год</span>
            </div>
            <div className="mt-0.5 text-base sm:text-lg font-bold break-words">
              {formatMoney(expenseYear)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <PiggyBank className="h-4 w-4" />
              <span>Прибыль за период</span>
            </div>
            <div
              className={`mt-0.5 text-base sm:text-lg font-bold break-words ${profitColor(profitMonth)}`}
            >
              {formatMoney(profitMonth)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Маржа: {marginMonth === null ? "—" : `${marginMonth.toFixed(1)}%`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <PiggyBank className="h-4 w-4" />
              <span>Прибыль за {periodEnd.getFullYear()} год</span>
            </div>
            <div
              className={`mt-0.5 text-base sm:text-lg font-bold break-words ${profitColor(profitYear)}`}
            >
              {formatMoney(profitYear)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Маржа: {marginYear === null ? "—" : `${marginYear.toFixed(1)}%`}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
