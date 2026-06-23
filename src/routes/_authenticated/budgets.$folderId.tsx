import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { ArrowLeft, Plus, Settings, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getCurrentPeriod, formatPeriod,
  type BudgetPlan, type BudgetCategory, type BudgetExpense,
} from "@/lib/budget";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/budgets/$folderId")({
  component: BudgetDetail,
});

function BudgetDetail() {
  const { folderId } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["budget-detail", folderId],
    queryFn: async () => {
      const [folder, plans, cats, exps] = await Promise.all([
        supabase.from("folders").select("id, name").eq("id", folderId).maybeSingle(),
        supabase.from("budget_plans").select("*").eq("folder_id", folderId).maybeSingle(),
        supabase.from("budget_categories").select("*"),
        supabase.from("budget_expenses").select("*"),
      ]);
      if (folder.error) throw folder.error;
      if (plans.error) throw plans.error;
      if (cats.error) throw cats.error;
      if (exps.error) throw exps.error;
      const plan = plans.data as BudgetPlan | null;
      const categories = ((cats.data ?? []) as BudgetCategory[]).filter((c) => c.plan_id === plan?.id);
      const expenses = ((exps.data ?? []) as BudgetExpense[]).filter((e) => e.plan_id === plan?.id);
      return { folder: folder.data, plan, categories, expenses };
    },
  });

  // Lazy rollover: archive expenses whose period_start is older than current
  const rollover = useMutation({
    mutationFn: async (args: { planId: string; currentStart: string }) => {
      const { error } = await supabase
        .from("budget_expenses")
        .update({ archived: true })
        .eq("plan_id", args.planId)
        .lt("period_start", args.currentStart)
        .eq("archived", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget-detail", folderId] }),
  });

  useEffect(() => {
    if (!data?.plan) return;
    const period = getCurrentPeriod(data.plan.reset_day);
    const stale = data.expenses.some((e) => !e.archived && e.period_start < period.start);
    if (stale) rollover.mutate({ planId: data.plan.id, currentStart: period.start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.plan?.id]);

  if (isLoading) return <div className="text-muted-foreground">Загрузка…</div>;
  if (!data?.folder) return <div>Папка не найдена. <Link to="/budgets" className="underline">Назад</Link></div>;
  if (!data.plan) return <NoPlan folderId={folderId} folderName={data.folder.name} />;

  const plan = data.plan;
  const period = getCurrentPeriod(plan.reset_day);
  const periodExps = data.expenses.filter((e) => e.period_start === period.start && !e.archived);
  const archivedExps = data.expenses.filter((e) => e.archived);

  const totalLimit = data.categories.reduce((s, c) => s + Number(c.limit_amount), 0);
  const totalSpent = periodExps.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/budgets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-xl sm:text-2xl font-bold truncate">{data.folder.name}</h1>
        <SettingsDialog plan={plan} categories={data.categories} folderId={folderId} />
      </div>
      <div className="text-sm text-muted-foreground">Период: {formatPeriod(period)} · обновляется {plan.reset_day} числа</div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="font-semibold">{formatMoney(totalSpent, plan.currency)} <span className="text-muted-foreground font-normal">из {formatMoney(totalLimit, plan.currency)}</span></div>
            <div className="text-xs text-muted-foreground">{totalLimit > 0 ? ((totalSpent / totalLimit) * 100).toFixed(0) : 0}%</div>
          </div>
          <Progress value={totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Статья</TableHead>
                <TableHead className="text-right">Лимит</TableHead>
                <TableHead className="text-right">Потрачено</TableHead>
                <TableHead className="text-right">Остаток</TableHead>
                <TableHead>%</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.categories.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Статьи не созданы. Откройте настройки.</TableCell></TableRow>
              )}
              {data.categories
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
                .map((cat) => {
                  const spent = periodExps.filter((e) => e.category_id === cat.id).reduce((s, e) => s + Number(e.amount), 0);
                  const limit = Number(cat.limit_amount);
                  const remain = limit - spent;
                  const pct = limit > 0 ? (spent / limit) * 100 : 0;
                  const warn = pct >= plan.warning_percent && pct < 100;
                  const over = pct >= 100 && limit > 0;
                  return (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className="text-right">{formatMoney(limit, plan.currency)}</TableCell>
                      <TableCell className="text-right">{formatMoney(spent, plan.currency)}</TableCell>
                      <TableCell className={`text-right ${remain < 0 ? "text-destructive" : ""}`}>{formatMoney(remain, plan.currency)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xs w-10">{pct.toFixed(0)}%</span>
                          {over && <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Перерасход</Badge>}
                          {warn && <Badge className="bg-amber-500 hover:bg-amber-500 text-[10px]">Близко</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <AddExpenseDialog plan={plan} category={cat} period={period} />
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {periodExps.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="font-medium text-sm">Расходы текущего периода</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Статья</TableHead>
                  <TableHead>Комментарий</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodExps
                  .slice()
                  .sort((a, b) => b.spent_at.localeCompare(a.spent_at))
                  .map((e) => {
                    const cat = data.categories.find((c) => c.id === e.category_id);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{formatDate(e.spent_at)}</TableCell>
                        <TableCell>{cat?.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{e.note}</TableCell>
                        <TableCell className="text-right">{formatMoney(Number(e.amount), plan.currency)}</TableCell>
                        <TableCell className="text-right">
                          <DeleteExpenseButton id={e.id} folderId={folderId} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {archivedExps.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="history">
            <AccordionTrigger>История периодов ({new Set(archivedExps.map((e) => e.period_start)).size})</AccordionTrigger>
            <AccordionContent>
              <ArchiveList expenses={archivedExps} categories={data.categories} currency={plan.currency} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

function NoPlan({ folderId, folderName }: { folderId: string; folderName: string }) {
  const qc = useQueryClient();
  const createPlan = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");
      const { error } = await supabase.from("budget_plans").insert({
        owner_id: u.user.id, folder_id: folderId, reset_day: 1, warning_percent: 80,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget-detail", folderId] }),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/budgets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-xl sm:text-2xl font-bold">{folderName}</h1>
      </div>
      <Card><CardContent className="p-6 space-y-3">
        <div className="text-sm text-muted-foreground">План расходов ещё не создан.</div>
        <Button onClick={() => createPlan.mutate()} disabled={createPlan.isPending}><Plus className="h-4 w-4 mr-1" />Создать план</Button>
      </CardContent></Card>
    </div>
  );
}

function SettingsDialog({ plan, categories, folderId }: { plan: BudgetPlan; categories: BudgetCategory[]; folderId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [resetDay, setResetDay] = useState(String(plan.reset_day));
  const [warn, setWarn] = useState(String(plan.warning_percent));
  const [rows, setRows] = useState<{ id?: string; name: string; limit_amount: string; _new?: boolean; _delete?: boolean }[]>([]);

  useEffect(() => {
    if (open) {
      setResetDay(String(plan.reset_day));
      setWarn(String(plan.warning_percent));
      setRows(categories.slice().sort((a, b) => a.sort_order - b.sort_order).map((c) => ({
        id: c.id, name: c.name, limit_amount: String(c.limit_amount),
      })));
    }
  }, [open, plan, categories]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");
      const day = Math.max(1, Math.min(28, parseInt(resetDay) || 1));
      const w = Math.max(0, Math.min(100, parseFloat(warn) || 0));
      const { error: e1 } = await supabase.from("budget_plans").update({
        reset_day: day, warning_percent: w,
      }).eq("id", plan.id);
      if (e1) throw e1;
      // Apply category changes
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r._delete && r.id) {
          await supabase.from("budget_categories").delete().eq("id", r.id);
        } else if (r.id) {
          await supabase.from("budget_categories").update({
            name: r.name.trim(), limit_amount: Number(r.limit_amount) || 0, sort_order: i,
          }).eq("id", r.id);
        } else if (r.name.trim()) {
          await supabase.from("budget_categories").insert({
            owner_id: u.user.id, plan_id: plan.id,
            name: r.name.trim(), limit_amount: Number(r.limit_amount) || 0, sort_order: i,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["budget-detail", folderId] });
      qc.invalidateQueries({ queryKey: ["budgets-index"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto"><Settings className="h-4 w-4 mr-1" />Настройки</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Настройки плана</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>День обновления (1–28)</Label>
            <Select value={resetDay} onValueChange={setResetDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Порог предупреждения, %</Label>
            <Input type="number" min={0} max={100} value={warn} onChange={(e) => setWarn(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Статьи расхода</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { name: "", limit_amount: "0", _new: true }])}>
              <Plus className="h-4 w-4 mr-1" />Добавить
            </Button>
          </div>
          <div className="space-y-2">
            {rows.map((r, idx) => r._delete ? null : (
              <div key={r.id ?? `new-${idx}`} className="flex gap-2 items-start">
                <Input
                  placeholder="Название"
                  value={r.name}
                  onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                />
                <Input
                  type="number"
                  placeholder="Лимит"
                  className="w-32"
                  value={r.limit_amount}
                  onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, limit_amount: e.target.value } : x))}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => {
                  if (r.id) setRows(rows.map((x, i) => i === idx ? { ...x, _delete: true } : x));
                  else setRows(rows.filter((_, i) => i !== idx));
                }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            {rows.filter((r) => !r._delete).length === 0 && (
              <div className="text-sm text-muted-foreground">Нет статей</div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddExpenseDialog({ plan, category, period }: { plan: BudgetPlan; category: BudgetCategory; period: { start: string; end: string } }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Введите сумму");
      const { error } = await supabase.from("budget_expenses").insert({
        owner_id: u.user.id,
        plan_id: plan.id,
        category_id: category.id,
        amount: amt,
        spent_at: date,
        note: note || null,
        period_start: period.start,
        period_end: period.end,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Расход добавлен");
      qc.invalidateQueries({ queryKey: ["budget-detail", plan.folder_id] });
      qc.invalidateQueries({ queryKey: ["budgets-index"] });
      qc.invalidateQueries({ queryKey: ["dashboard-budget"] });
      setOpen(false);
      setAmount(""); setNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Расход — {category.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Сумма</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Дата</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Комментарий</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Добавить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteExpenseButton({ id, folderId }: { id: string; folderId: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("budget_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-detail", folderId] });
      qc.invalidateQueries({ queryKey: ["budgets-index"] });
      qc.invalidateQueries({ queryKey: ["dashboard-budget"] });
    },
  });
  return (
    <Button variant="ghost" size="icon" onClick={() => del.mutate()} disabled={del.isPending}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

function ArchiveList({ expenses, categories, currency }: { expenses: BudgetExpense[]; categories: BudgetCategory[]; currency: string }) {
  const groups = new Map<string, BudgetExpense[]>();
  for (const e of expenses) {
    const arr = groups.get(e.period_start) ?? [];
    arr.push(e);
    groups.set(e.period_start, arr);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  return (
    <div className="space-y-3">
      {sorted.map(([start, list]) => {
        const total = list.reduce((s, e) => s + Number(e.amount), 0);
        const end = list[0]?.period_end;
        return (
          <Card key={start}>
            <CardContent className="p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <div className="font-medium">{formatDate(start)} — {formatDate(end)}</div>
                <div>{formatMoney(total, currency)}</div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {list.map((e) => {
                  const c = categories.find((x) => x.id === e.category_id);
                  return (
                    <div key={e.id} className="flex justify-between">
                      <span>{formatDate(e.spent_at)} · {c?.name ?? "—"}{e.note ? ` · ${e.note}` : ""}</span>
                      <span>{formatMoney(Number(e.amount), currency)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}