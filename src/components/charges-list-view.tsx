import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ChargeStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Plus, Receipt, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { chargeTotalForPeriod, formatDate, formatMoney, splitContractPeriods } from "@/lib/format";
import { humanError } from "@/lib/human-error";
import { AddPaymentDialog } from "@/components/add-payment-dialog";

const ALL = "__all__";

export function ChargesListView() {
  const [filter, setFilter] = useState<"active" | "archive">("active");
  const [q, setQ] = useState("");
  const [tenantId, setTenantId] = useState<string>(ALL);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const { data, isLoading } = useQuery({
    queryKey: ["charges", filter],
    queryFn: async () => {
      let qb = supabase
        .from("charges")
        .select(
          "*, contract:contracts(id, number, currency, tenant:tenants(id, name), property:properties(name))",
        )
        .order("period_start", { ascending: false });
      if (filter === "active") {
        qb = qb.neq("status", "paid");
      } else {
        qb = qb.eq("status", "paid");
      }
      const { data, error } = await qb;
      if (error) throw error;
      return data;
    },
  });

  // Арендаторы для фильтра — из загруженных начислений, чтобы в списке были
  // только те, у кого есть что выбирать.
  const tenants = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of (data ?? []) as any[]) {
      const t = c.contract?.tenant;
      if (t?.id) m.set(t.id, t.name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = ((data ?? []) as any[]).filter((c) => {
      if (tenantId !== ALL && c.contract?.tenant?.id !== tenantId) return false;
      if (!s) return true;
      return (
        (c.contract?.tenant?.name ?? "").toLowerCase().includes(s) ||
        (c.contract?.number ?? "").toLowerCase().includes(s) ||
        (c.contract?.property?.name ?? "").toLowerCase().includes(s) ||
        formatDate(c.period_start).includes(s)
      );
    });
    if (sort === "oldest") rows.reverse();
    return rows;
  }, [data, q, tenantId, sort]);

  const totals = useMemo(() => {
    let remain = 0;
    let total = 0;
    for (const c of filtered) {
      total += Number(c.total);
      remain += Math.max(0, Number(c.total) - Number(c.paid_total));
    }
    return { remain, total, count: filtered.length };
  }, [filtered]);

  const currency = (filtered[0]?.contract?.currency as string | undefined) ?? "RUB";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "active" | "archive")}>
          <TabsList>
            <TabsTrigger value="active">Неоплаченные</TabsTrigger>
            <TabsTrigger value="archive">Оплаченные</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto">
          <AutoChargesButton />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="Поиск начислений"
            type="search"
            placeholder="Арендатор, договор, объект"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Фильтр по арендатору">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все арендаторы</SelectItem>
            {tenants.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as "newest" | "oldest")}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Порядок">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Сначала новые</SelectItem>
            <SelectItem value="oldest">Сначала старые долги</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="text-sm text-muted-foreground" aria-live="polite">
          {filter === "active" ? (
            <>
              Не оплачено:{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(totals.remain, currency)}
              </span>{" "}
              по {totals.count} начислениям
            </>
          ) : (
            <>
              Оплачено:{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(totals.total, currency)}
              </span>{" "}
              по {totals.count} начислениям
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div>Загрузка...</div>
      ) : !data || data.length === 0 ? (
        <Card className="p-12 text-center">
          <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">
            {filter === "archive" ? "Оплаченных начислений нет" : "Неоплаченных начислений нет"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {filter === "archive"
              ? "Оплаченные начисления появятся здесь после поступления платежей."
              : "Все начисления оплачены."}
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ничего не найдено — измените поиск или фильтр.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c: any) => {
            const remain = Math.max(0, Number(c.total) - Number(c.paid_total));
            return (
              <Card key={c.id} className="p-3 flex items-center gap-3">
                <Link
                  to="/charges/$id"
                  params={{ id: c.id }}
                  className="min-w-0 flex-1 rounded-md -m-1 p-1 hover:bg-muted/50"
                >
                  <div className="font-medium text-sm break-words">
                    {c.contract?.tenant?.name} · № {c.contract?.number || "б/н"}
                  </div>
                  <div className="text-xs text-muted-foreground break-words">
                    {c.contract?.property?.name} · {formatDate(c.period_start)} —{" "}
                    {formatDate(c.period_end)}
                    {c.due_date ? ` · срок ${formatDate(c.due_date)}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Оплачено {formatMoney(c.paid_total, c.contract?.currency)} из{" "}
                    {formatMoney(c.total, c.contract?.currency)}
                    {remain > 0 && (
                      <span className="text-foreground font-medium">
                        {" "}
                        · остаток {formatMoney(remain, c.contract?.currency)}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <ChargeStatusBadge className="whitespace-nowrap" status={c.status} />
                  {c.status !== "paid" && (
                    <AddPaymentDialog
                      chargeId={c.id}
                      suggested={remain}
                      currency={c.contract?.currency ?? "RUB"}
                      trigger={
                        <Button size="sm" variant="outline" aria-label="Отметить оплату">
                          <Plus className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Оплата</span>
                        </Button>
                      }
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

type PlannedCharge = {
  owner_id: string;
  contract_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  total: number;
};

function AutoChargesButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planned, setPlanned] = useState<PlannedCharge[]>([]);
  const [contractsCount, setContractsCount] = useState(0);

  async function buildPlan() {
    setPlanning(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");
      const { data: contracts, error } = await supabase
        .from("contracts")
        .select("id,start_date,end_date,rate,area,payment_period,kind,status")
        .eq("status", "active")
        .eq("kind", "rent")
        // Допсоглашение — не договор: иначе по нему создавались дубли начислений.
        .is("parent_contract_id", null);
      if (error) throw error;

      const ids = (contracts ?? []).map((c) => c.id);
      const existing = new Set<string>();
      if (ids.length > 0) {
        const { data: existCharges, error: e2 } = await supabase
          .from("charges")
          .select("contract_id,period_start")
          .in("contract_id", ids);
        if (e2) throw e2;
        for (const c of existCharges ?? []) existing.add(`${c.contract_id}|${c.period_start}`);
      }

      const today = new Date();
      const all: PlannedCharge[] = [];
      const touched = new Set<string>();
      for (const c of contracts ?? []) {
        if (!c.start_date) continue;
        const segs = splitContractPeriods(c.start_date, c.end_date, c.payment_period, today);
        for (const s of segs) {
          if (existing.has(`${c.id}|${s.period_start}`)) continue;
          const total = chargeTotalForPeriod(
            Number(c.rate),
            c.payment_period,
            s.period_start,
            s.period_end,
            Number(c.area || 0),
          );
          all.push({
            owner_id: u.user.id,
            contract_id: c.id,
            period_start: s.period_start,
            period_end: s.period_end,
            due_date: s.period_end,
            total,
          });
          touched.add(c.id);
        }
      }
      setPlanned(all);
      setContractsCount(touched.size);
      setOpen(true);
    } catch (e) {
      toast.error(humanError(e, "Не удалось подготовить начисления"));
    } finally {
      setPlanning(false);
    }
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (planned.length === 0) return 0;
      const CHUNK = 500;
      for (let i = 0; i < planned.length; i += CHUNK) {
        const slice = planned.slice(i, i + CHUNK);
        const { error } = await supabase.from("charges").insert(slice);
        if (error) throw error;
      }
      return planned.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["contract-charges"] });
      qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
      toast.success(`Создано начислений: ${n}`);
      setOpen(false);
      setPlanned([]);
    },
    onError: (e) => toast.error(humanError(e, "Ошибка создания начислений")),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {/* Массовая операция — вторичная кнопка, а не главное действие экрана. */}
      <Button size="sm" variant="outline" onClick={buildPlan} disabled={planning}>
        <Calculator className="h-4 w-4 mr-1" />
        {planning ? "Расчёт..." : "Авторасчёт начислений"}
      </Button>
      <AlertDialogTrigger asChild>
        <span className="hidden" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Авторасчёт начислений</AlertDialogTitle>
          <AlertDialogDescription>
            {planned.length === 0
              ? "Все начисления уже на месте — создавать нечего."
              : `Будет создано ${planned.length} начислений по ${contractsCount} договорам (аренда, активные; допсоглашения не считаются). Дубликаты по периоду не создаются. Продолжить?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          {planned.length > 0 && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mut.mutate();
              }}
              disabled={mut.isPending}
            >
              {mut.isPending ? "Создаём..." : "Создать"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
