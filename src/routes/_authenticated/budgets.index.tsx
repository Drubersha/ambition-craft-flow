import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, PiggyBank, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getCurrentPeriod, formatPeriod, type BudgetPlan, type BudgetCategory, type BudgetExpense } from "@/lib/budget";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/budgets/")({
  component: BudgetsIndex,
});

function BudgetsIndex() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["budgets-index"],
    queryFn: async () => {
      const [folders, plans, cats, exps] = await Promise.all([
        supabase.from("folders").select("id, name, parent_id").order("name"),
        supabase.from("budget_plans").select("*"),
        supabase.from("budget_categories").select("*"),
        supabase.from("budget_expenses").select("*").eq("archived", false),
      ]);
      if (folders.error) throw folders.error;
      if (plans.error) throw plans.error;
      if (cats.error) throw cats.error;
      if (exps.error) throw exps.error;
      return {
        folders: folders.data ?? [],
        plans: (plans.data ?? []) as BudgetPlan[],
        categories: (cats.data ?? []) as BudgetCategory[],
        expenses: (exps.data ?? []) as BudgetExpense[],
      };
    },
  });

  const createPlan = useMutation({
    mutationFn: async (folderId: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");
      const { error } = await supabase.from("budget_plans").insert({
        owner_id: u.user.id,
        folder_id: folderId,
        reset_day: 1,
        warning_percent: 80,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("План создан");
      qc.invalidateQueries({ queryKey: ["budgets-index"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Загрузка…</div>;

  const planByFolder = new Map(data!.plans.map((p) => [p.folder_id, p]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PiggyBank className="h-5 w-5 text-primary" />
        <h1 className="text-xl sm:text-2xl font-bold">Бюджет</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        План расходов создаётся для каждой папки объектов. Внутри плана — статьи расхода с лимитами и обновление по выбранному числу месяца.
      </p>

      {data!.folders.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Нет папок. Создайте папку в разделе «Объекты».</CardContent></Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data!.folders.map((f) => {
          const plan = planByFolder.get(f.id);
          if (!plan) {
            return (
              <Card key={f.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">План не создан</div>
                  <Button size="sm" onClick={() => createPlan.mutate(f.id)} disabled={createPlan.isPending}>
                    <Plus className="h-4 w-4 mr-1" /> Создать план
                  </Button>
                </CardContent>
              </Card>
            );
          }
          const cats = data!.categories.filter((c) => c.plan_id === plan.id);
          const period = getCurrentPeriod(plan.reset_day);
          const periodExps = data!.expenses.filter(
            (e) => e.plan_id === plan.id && e.period_start === period.start,
          );
          const totalLimit = cats.reduce((s, c) => s + Number(c.limit_amount), 0);
          const totalSpent = periodExps.reduce((s, e) => s + Number(e.amount), 0);
          const pct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
          const warn = pct >= plan.warning_percent && pct < 100;
          const over = pct >= 100;
          return (
            <Link key={f.id} to="/budgets/$folderId" params={{ folderId: f.id }}>
              <Card className="hover:border-primary transition-colors">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{f.name}</div>
                    {over && <Badge variant="destructive" className="shrink-0"><AlertTriangle className="h-3 w-3 mr-1" />Перерасход</Badge>}
                    {warn && <Badge className="bg-amber-500 hover:bg-amber-500 shrink-0">Близко к лимиту</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatPeriod(period)}</div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-sm">
                      <span className={over ? "text-destructive font-semibold" : "font-semibold"}>{formatMoney(totalSpent, plan.currency)}</span>
                      <span className="text-muted-foreground"> / {formatMoney(totalLimit, plan.currency)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{pct.toFixed(0)}%</div>
                  </div>
                  <Progress value={Math.min(pct, 100)} className="h-1.5" />
                  <div className="text-xs text-muted-foreground">{cats.length} статей</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}