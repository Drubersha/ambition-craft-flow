/** Бюджетные карточки дашборда: план vs факт и структура расходов за период. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, monthKeysBetween } from "@/lib/format";
import { plannedForMonths } from "@/lib/budget";
import { EmptyText } from "./ui";

export function BudgetPlanVsFact({
  periodStart,
  periodEnd,
}: {
  periodStart: Date;
  periodEnd: Date;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-budget-pvf"],
    queryFn: async () => {
      const [folders, plans, cats, exps, limits] = await Promise.all([
        supabase.from("folders").select("id, name"),
        supabase.from("budget_plans").select("id, folder_id"),
        supabase.from("budget_categories").select("id, plan_id, limit_amount"),
        supabase.from("budget_expenses").select("plan_id, amount, spent_at"),
        supabase
          .from("budget_period_limits")
          .select("plan_id, category_id, period_start, limit_amount"),
      ]);
      if (folders.error) throw folders.error;
      if (plans.error) throw plans.error;
      if (cats.error) throw cats.error;
      if (exps.error) throw exps.error;
      if (limits.error) throw limits.error;
      return {
        folders: folders.data ?? [],
        plans: plans.data ?? [],
        categories: cats.data ?? [],
        expenses: exps.data ?? [],
        periodLimits: limits.data ?? [],
      };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const inPeriod = (s: string) => {
      const d = new Date(s);
      return d >= periodStart && d <= periodEnd;
    };
    // План берём помесячно: лимит категории меняется от месяца к месяцу
    // (в отчёте 1С коммуналка идёт 550 000 в январе и 130 000 в июле),
    // поэтому умножать один лимит на число месяцев нельзя.
    const months = monthKeysBetween(periodStart, periodEnd);
    const catsByPlan = new Map<string, { id: string; limit_amount: number }[]>();
    for (const c of data.categories as any[]) {
      const arr = catsByPlan.get(c.plan_id) ?? [];
      arr.push({ id: c.id, limit_amount: Number(c.limit_amount || 0) });
      catsByPlan.set(c.plan_id, arr);
    }
    const limitsByPlan = new Map<string, any[]>();
    for (const l of (data.periodLimits ?? []) as any[]) {
      const arr = limitsByPlan.get(l.plan_id) ?? [];
      arr.push(l);
      limitsByPlan.set(l.plan_id, arr);
    }
    const planLimitByPlan = new Map<string, number>();
    for (const [planId, cats] of catsByPlan) {
      planLimitByPlan.set(planId, plannedForMonths(months, cats, limitsByPlan.get(planId) ?? []));
    }
    const factByPlan = new Map<string, number>();
    for (const e of data.expenses as any[]) {
      if (!inPeriod(e.spent_at)) continue;
      factByPlan.set(e.plan_id, (factByPlan.get(e.plan_id) ?? 0) + Number(e.amount || 0));
    }
    const folderName = new Map((data.folders as any[]).map((f) => [f.id, f.name]));
    return (data.plans as any[])
      .map((p) => ({
        name: folderName.get(p.folder_id) ?? "—",
        plan: planLimitByPlan.get(p.id) ?? 0,
        fact: factByPlan.get(p.id) ?? 0,
      }))
      .filter((r) => r.plan > 0 || r.fact > 0)
      .sort((a, b) => b.plan + b.fact - (a.plan + a.fact));
  }, [data, periodStart, periodEnd]);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-base">План vs Факт (за период)</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {isLoading ? (
          <EmptyText text="Загрузка…" />
        ) : rows.length === 0 ? (
          <EmptyText text="Нет бюджетных планов — создайте их в разделе «Бюджет»." />
        ) : (
          <div style={{ width: "100%", height: Math.max(180, rows.length * 48) }}>
            <ResponsiveContainer>
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                <RTooltip formatter={(v: any) => formatMoney(Number(v))} />
                <Bar dataKey="plan" name="План" fill="var(--info)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="fact" name="Факт" radius={[0, 4, 4, 0]}>
                  {rows.map((r, i) => (
                    <Cell
                      key={i}
                      fill={r.fact > r.plan ? "var(--destructive)" : "var(--success)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BudgetExpenseStructure({
  periodStart,
  periodEnd,
}: {
  periodStart: Date;
  periodEnd: Date;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-budget-structure"],
    queryFn: async () => {
      const [cats, exps] = await Promise.all([
        supabase.from("budget_categories").select("id, name"),
        supabase.from("budget_expenses").select("category_id, amount, spent_at"),
      ]);
      if (cats.error) throw cats.error;
      if (exps.error) throw exps.error;
      return { categories: cats.data ?? [], expenses: exps.data ?? [] };
    },
  });

  const slices = useMemo(() => {
    if (!data) return [] as { name: string; value: number }[];
    const nameById = new Map((data.categories as any[]).map((c) => [c.id, c.name]));
    const sums = new Map<string, number>();
    for (const e of data.expenses as any[]) {
      const d = new Date(e.spent_at);
      if (d < periodStart || d > periodEnd) continue;
      const key = nameById.get(e.category_id) ?? "Без категории";
      sums.set(key, (sums.get(key) ?? 0) + Number(e.amount || 0));
    }
    return Array.from(sums.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data, periodStart, periodEnd]);

  const total = slices.reduce((s, r) => s + r.value, 0);
  const palette = [
    "var(--info)",
    "var(--success)",
    "var(--warning)",
    "var(--destructive)",
    "var(--primary)",
    "var(--accent)",
  ];

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-base">Структура операционных расходов (за период)</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {isLoading ? (
          <EmptyText text="Загрузка…" />
        ) : slices.length === 0 ? (
          <EmptyText text="Нет расходов за выбранный период." />
        ) : (
          <div style={{ width: "100%", height: 210 }}>
            <ResponsiveContainer>
              <PieChart>
                <RTooltip
                  formatter={(v: any, n: any) => [
                    `${formatMoney(Number(v))} (${total > 0 ? ((Number(v) / total) * 100).toFixed(1) : 0}%)`,
                    n,
                  ]}
                />
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label={(e: any) =>
                    `${e.name} ${total > 0 ? ((e.value / total) * 100).toFixed(0) : 0}%`
                  }
                >
                  {slices.map((_, i) => (
                    <Cell key={i} fill={palette[i % palette.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {!isLoading && slices.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Всего расходов за месяц</span>
            <span className="text-base font-bold text-foreground">{formatMoney(total)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
