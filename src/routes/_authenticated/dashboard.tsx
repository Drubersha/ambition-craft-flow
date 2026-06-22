import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatMoney,
  formatDate,
  daysUntil,
  monthlyFromRate,
  monthlyPayment,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
} from "@/lib/format";
import {
  Building2,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Percent,
  CalendarClock,
  X,
  Filter,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Period = "day" | "month" | "quarter" | "year" | "custom";

type Property = {
  id: string;
  name: string;
  type: string;
  status: string;
  area_total: number;
  base_rate: number | null;
  currency: string;
};
type Contract = {
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
type Charge = {
  id: string;
  contract_id: string;
  total: number;
  paid_total: number;
  status: string;
  due_date: string | null;
  period_start: string;
  period_end: string;
};
type Payment = {
  id: string;
  charge_id: string;
  amount: number;
  paid_at: string;
  method: string | null;
};

function getPeriodRange(period: Period, customFrom?: string, customTo?: string): [Date, Date] {
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

function Dashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedProps, setSelectedProps] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [propsQuery, setPropsQuery] = useState("");
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showKpiHints, setShowKpiHints] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-raw"],
    queryFn: async () => {
      const [pr, co, ch, py] = await Promise.all([
        supabase
          .from("properties")
          .select("id,name,type,status,area_total,base_rate,currency"),
        supabase
          .from("contracts")
          .select(
            "id,number,status,kind,start_date,end_date,rate,area,payment_period,currency,property_id,tenant_id,tenant:tenants(id,name),property:properties(id,name,type,area_total)",
          ),
        supabase
          .from("charges")
          .select("id,contract_id,total,paid_total,status,due_date,period_start,period_end"),
        supabase
          .from("payments")
          .select("id,charge_id,amount,paid_at,method"),
      ]);
      if (pr.error) throw pr.error;
      if (co.error) throw co.error;
      if (ch.error) throw ch.error;
      if (py.error) throw py.error;
      return {
        properties: (pr.data ?? []) as Property[],
        contracts: (co.data ?? []) as unknown as Contract[],
        charges: (ch.data ?? []) as Charge[],
        payments: (py.data ?? []) as Payment[],
        loadedAt: new Date(),
      };
    },
  });

  const [periodStart, periodEnd] = useMemo(
    () => getPeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const filtered = useMemo(() => {
    if (!data)
      return {
        properties: [] as Property[],
        contracts: [] as Contract[],
        charges: [] as Charge[],
        payments: [] as Payment[],
        ahchContracts: [] as Contract[],
      };
    const propIdSet = new Set(
      data.properties
        .filter(
          (p) =>
            (selectedProps.length === 0 || selectedProps.includes(p.id)) &&
            (selectedTypes.length === 0 || selectedTypes.includes(p.type)) &&
            (selectedStatuses.length === 0 || selectedStatuses.includes(p.status)),
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
  }, [data, selectedProps, selectedTypes, selectedStatuses]);

  const kpi = useMemo(() => {
    const totalArea = filtered.properties.reduce((s, p) => s + Number(p.area_total || 0), 0);
    const activeContracts = filtered.contracts.filter((c) => c.status === "active");
    const activeAhch = filtered.ahchContracts.filter((c) => c.status === "active");
    const ahchArea = activeAhch.reduce((s, c) => s + Number(c.area || 0), 0);
    const ahchShare = totalArea > 0 ? (ahchArea / totalArea) * 100 : 0;
    const leasedArea = activeContracts.reduce((s, c) => s + Number(c.area || 0), 0);
    const occupancy = totalArea > 0 ? (leasedArea / totalArea) * 100 : 0;

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
  }, [filtered, periodStart, periodEnd]);

  if (isLoading) return <div className="p-6">Загрузка…</div>;
  if (!data) return null;

  const allTypes = Array.from(new Set(data.properties.map((p) => p.type)));
  const allStatuses = Array.from(new Set(data.properties.map((p) => p.status)));

  const activeContractsForHint = filtered.contracts.filter((c) => c.status === "active");
  const activeAhchForHint = filtered.ahchContracts.filter((c) => c.status === "active");
  const leasedAreaHint = activeContractsForHint.reduce((s, c) => s + Number(c.area || 0), 0);
  const periodPaymentsHint = filtered.payments.filter((p) => {
    const d = new Date(p.paid_at);
    return d >= periodStart && d <= periodEnd;
  });
  const kpiHints: Record<string, string> = {
    totalArea: `Сумма площадей ${filtered.properties.length} объектов(а) в фильтре.`,
    propsCount: `Количество объектов, попавших под текущие фильтры.`,
    occupancy: `${formatNum(leasedAreaHint)} м² занято по ${activeContractsForHint.length} активным договорам / ${formatNum(kpi.totalArea)} м² общая площадь.`,
    rentIncome: `Сумма ${periodPaymentsHint.length} платежей за период ${formatDate(periodStart.toISOString())} — ${formatDate(periodEnd.toISOString())}.`,
    monthlyIncome: `Сумма месячных платежей по ${activeContractsForHint.length} активным договорам (ставка × площадь, без АХЧ).`,
    avgRate: `Средневзвешенная по площади ставка ${activeContractsForHint.length} активных договоров (₽/м²/мес).`,
    overdueAmt: `Остаток к оплате по начислениям с просрочкой более 30 дней.`,
    expSoon: `Активные договоры с датой окончания в ближайшие 90 дней.`,
    ahchArea: `Сумма площадей по ${activeAhchForHint.length} активным договорам АХЧ.`,
    ahchShare: `${formatNum(kpi.ahchArea)} м² АХЧ / ${formatNum(kpi.totalArea)} м² общая площадь.`,
  };

  const resetFilters = () => {
    setPeriod("month");
    setCustomFrom("");
    setCustomTo("");
    setSelectedProps([]);
    setSelectedTypes([]);
    setSelectedStatuses([]);
  };

  const activeChips: { label: string; clear: () => void }[] = [];
  if (period !== "month")
    activeChips.push({ label: `Период: ${periodLabel(period)}`, clear: () => setPeriod("month") });
  if (period === "custom" && (customFrom || customTo))
    activeChips.push({
      label: `${customFrom || "…"} — ${customTo || "…"}`,
      clear: () => {
        setCustomFrom("");
        setCustomTo("");
      },
    });
  selectedProps.forEach((id) => {
    const p = data.properties.find((x) => x.id === id);
    if (p)
      activeChips.push({
        label: p.name,
        clear: () => setSelectedProps((s) => s.filter((v) => v !== id)),
      });
  });
  selectedTypes.forEach((t) =>
    activeChips.push({
      label: PROPERTY_TYPE_LABELS[t] || t,
      clear: () => setSelectedTypes((s) => s.filter((v) => v !== t)),
    }),
  );
  selectedStatuses.forEach((s) =>
    activeChips.push({
      label: PROPERTY_STATUS_LABELS[s] || s,
      clear: () => setSelectedStatuses((x) => x.filter((v) => v !== s)),
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Дашборд</h1>
          <p className="text-xs text-muted-foreground">
            Обновлено: {data.loadedAt.toLocaleTimeString("ru-RU")} · Период:{" "}
            {formatDate(periodStart.toISOString())} — {formatDate(periodEnd.toISOString())}
          </p>
        </div>
      </div>

      {/* Global filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Сегодня</SelectItem>
                <SelectItem value="month">Месяц</SelectItem>
                <SelectItem value="quarter">Квартал</SelectItem>
                <SelectItem value="year">Год</SelectItem>
                <SelectItem value="custom">Произвольный</SelectItem>
              </SelectContent>
            </Select>
            {period === "custom" && (
              <>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-[160px]"
                />
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-[160px]"
                />
              </>
            )}

            <MultiSelectPopover
              label="Объекты"
              options={data.properties.map((p) => ({ value: p.id, label: p.name }))}
              value={selectedProps}
              onChange={setSelectedProps}
            />
            <MultiSelectPopover
              label="Тип"
              options={allTypes.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] || t }))}
              value={selectedTypes}
              onChange={setSelectedTypes}
            />
            <MultiSelectPopover
              label="Статус"
              options={allStatuses.map((s) => ({
                value: s,
                label: PROPERTY_STATUS_LABELS[s] || s,
              }))}
              value={selectedStatuses}
              onChange={setSelectedStatuses}
            />

            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Сбросить все
            </Button>
          </div>
          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeChips.map((c, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  {c.label}
                  <button
                    onClick={c.clear}
                    className="ml-1 rounded hover:bg-background/60 p-0.5"
                    aria-label="Удалить фильтр"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block 1: Portfolio KPI */}
      <Section
        title="Портфель — ключевые показатели"
        right={
          <label className="flex items-center gap-2 text-xs font-normal normal-case tracking-normal text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showKpiHints}
              onChange={(e) => setShowKpiHints(e.target.checked)}
            />
            Подсказки при наведении
          </label>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={Building2} label="Общая площадь" value={`${formatNum(kpi.totalArea)} м²`} hint={showKpiHints ? kpiHints.totalArea : undefined} />
          <Kpi icon={Building2} label="Объектов" value={kpi.propsCount} hint={showKpiHints ? kpiHints.propsCount : undefined} />
          <Kpi
            icon={Percent}
            label="Занятость"
            value={`${kpi.occupancy.toFixed(1)}%`}
            tone={occupancyTone(kpi.occupancy)}
            sub={<Progress value={kpi.occupancy} className="mt-2 h-1.5" />}
            hint={showKpiHints ? kpiHints.occupancy : undefined}
          />
          <Kpi icon={Wallet} label="Арендный доход" value={formatMoney(kpi.rentIncome)} hint={showKpiHints ? kpiHints.rentIncome : undefined} />
          <Kpi icon={Wallet} label="Месячные платежи" value={formatMoney(kpi.monthlyIncome)} hint={showKpiHints ? kpiHints.monthlyIncome : undefined} />
          <Kpi
            icon={TrendingUp}
            label="Средняя ставка"
            value={`${formatNum(kpi.avgRate)} ₽/м²/мес`}
            hint={showKpiHints ? kpiHints.avgRate : undefined}
          />
          <Kpi
            icon={AlertTriangle}
            label="Дебиторка > 30 дн"
            value={formatMoney(kpi.overdueAmt)}
            tone={kpi.overdueAmt > 0 ? "danger" : "ok"}
            hint={showKpiHints ? kpiHints.overdueAmt : undefined}
          />
          <Kpi
            icon={CalendarClock}
            label="Истекают за 90 дн"
            value={kpi.expSoon}
            tone={kpi.expSoon > 0 ? "warn" : "ok"}
            hint={showKpiHints ? kpiHints.expSoon : undefined}
          />
          <Kpi
            icon={Building2}
            label="Площадь АХЧ"
            value={`${formatNum(kpi.ahchArea)} м²`}
            hint={showKpiHints ? kpiHints.ahchArea : undefined}
          />
          <Kpi
            icon={Percent}
            label="Доля АХЧ"
            value={`${kpi.ahchShare.toFixed(1)}%`}
            sub={<Progress value={kpi.ahchShare} className="mt-2 h-1.5" />}
            hint={showKpiHints ? kpiHints.ahchShare : undefined}
          />
        </div>
      </Section>

      {/* Block 2: Properties table */}
      <Section title="Объекты и помещения">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="Поиск по названию…"
              value={propsQuery}
              onChange={(e) => setPropsQuery(e.target.value)}
              className="max-w-xs"
            />
            <PropertiesTable
              properties={filtered.properties}
              contracts={filtered.contracts}
              query={propsQuery}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={(k) => {
                if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
                else {
                  setSortKey(k);
                  setSortDir("asc");
                }
              }}
            />
          </CardContent>
        </Card>
      </Section>

      {/* Block 3: Contracts */}
      <Section title="Договорная база">
        <div className="grid lg:grid-cols-2 gap-4">
          <ContractsStatusPie contracts={filtered.contracts} />
          <ExpiringLists contracts={filtered.contracts} />
          <RateHistoryTable contracts={filtered.contracts} />
          <PlaceholderCard
            title="Воронка новых арендаторов"
            text="Источник данных по лидам/просмотрам/переговорам не подключён."
          />
        </div>
      </Section>

      {/* Block 4: AR */}
      <Section title="Дебиторская задолженность">
        <ArSection
          charges={filtered.charges}
          contracts={filtered.contracts}
          payments={filtered.payments}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      </Section>

      {/* Block 5: Finance */}
      <Section title="Финансовые показатели">
        <FinanceSection
          payments={filtered.payments}
          properties={filtered.properties}
          contracts={filtered.contracts}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      </Section>
    </div>
  );
}

function periodLabel(p: Period) {
  return { day: "Сегодня", month: "Месяц", quarter: "Квартал", year: "Год", custom: "Произвольный" }[
    p
  ];
}

function formatNum(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function occupancyTone(v: number): "ok" | "warn" | "danger" {
  if (v >= 90) return "ok";
  if (v >= 70) return "warn";
  return "danger";
}

function toneClass(t?: "ok" | "warn" | "danger") {
  if (t === "ok") return "text-success";
  if (t === "warn") return "text-warning";
  if (t === "danger") return "text-destructive";
  return "";
}

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  hint,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "ok" | "warn" | "danger";
  hint?: string;
}) {
  const card = (
    <Card className={hint ? "cursor-help" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="truncate">{label}</span>
        </div>
        <div className={`mt-1 text-lg sm:text-xl font-bold break-words ${toneClass(tone)}`}>
          {value}
        </div>
        {sub}
      </CardContent>
    </Card>
  );
  if (!hint) return card;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{card}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MultiSelectPopover({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const visible = options.filter((o) =>
    o.label.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
          {value.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {value.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 space-y-2">
        <Input
          placeholder="Поиск…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8"
        />
        <div className="max-h-64 overflow-auto space-y-1">
          {visible.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">Ничего не найдено</div>
          )}
          {visible.map((o) => {
            const checked = value.includes(o.value);
            return (
              <label
                key={o.value}
                className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) onChange(value.filter((v) => v !== o.value));
                    else onChange([...value, o.value]);
                  }}
                />
                <span className="truncate">{o.label}</span>
              </label>
            );
          })}
        </div>
        {value.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
            Очистить
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PropertiesTable({
  properties,
  contracts,
  query,
  sortKey,
  sortDir,
  onSort,
}: {
  properties: Property[];
  contracts: Contract[];
  query: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: string) => void;
}) {
  const rows = useMemo(() => {
    return properties
      .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))
      .map((p) => {
        const active = contracts.filter((c) => c.property_id === p.id && c.status === "active");
        const leased = active.reduce((s, c) => s + Number(c.area || 0), 0);
        const occ = p.area_total > 0 ? (leased / p.area_total) * 100 : 0;
        const monthlyIncome = active.reduce(
          (s, c) => s + monthlyFromRate(Number(c.rate), c.payment_period) * Number(c.area || 0),
          0,
        );
        const avgRate =
          leased > 0
            ? active.reduce(
                (s, c) => s + monthlyFromRate(Number(c.rate), c.payment_period) * Number(c.area || 0),
                0,
              ) / leased
            : Number(p.base_rate || 0);
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          area: p.area_total,
          occ,
          rate: avgRate,
          income: monthlyIncome,
          status: p.status,
        };
      });
  }, [properties, contracts, query]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a: any, b: any) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "ru");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const Th = ({ k, children, num }: any) => (
    <th
      onClick={() => onSort(k)}
      className={`text-${num ? "right" : "left"} font-medium text-xs uppercase tracking-wide text-muted-foreground p-2 cursor-pointer select-none`}
    >
      {children} {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  if (sorted.length === 0)
    return <div className="text-sm text-muted-foreground p-4">Нет объектов</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <Th k="name">Объект</Th>
            <Th k="type">Тип</Th>
            <Th k="area" num>
              Площадь, м²
            </Th>
            <Th k="occ" num>
              Занятость
            </Th>
            <Th k="rate" num>
              Ставка, ₽/м²
            </Th>
            <Th k="income" num>
              Доход/мес
            </Th>
            <Th k="status">Статус</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b hover:bg-accent/30">
              <td className="p-2">
                <Link
                  to="/properties/$id"
                  params={{ id: r.id }}
                  className="font-medium hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td className="p-2 text-muted-foreground">
                {PROPERTY_TYPE_LABELS[r.type] || r.type}
              </td>
              <td className="p-2 text-right tabular-nums">{formatNum(r.area)}</td>
              <td className="p-2 w-[180px]">
                <div className="flex items-center gap-2">
                  <Progress value={r.occ} className="h-1.5" />
                  <span
                    className={`text-xs tabular-nums w-12 text-right ${toneClass(occupancyTone(r.occ))}`}
                  >
                    {r.occ.toFixed(0)}%
                  </span>
                </div>
              </td>
              <td className="p-2 text-right tabular-nums">{formatNum(r.rate)}</td>
              <td className="p-2 text-right tabular-nums">{formatMoney(r.income)}</td>
              <td className="p-2">
                <Badge variant={r.status === "free" ? "destructive" : "secondary"}>
                  {PROPERTY_STATUS_LABELS[r.status] || r.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: "var(--success)",
  draft: "var(--info)",
  finished: "var(--muted-foreground)",
  terminated: "var(--destructive)",
};

function ContractsStatusPie({ contracts }: { contracts: Contract[] }) {
  const data = useMemo(() => {
    const m = new Map<string, number>();
    contracts.forEach((c) => m.set(c.status, (m.get(c.status) || 0) + 1));
    return Array.from(m.entries()).map(([status, value]) => ({
      status,
      value,
      label: CONTRACT_STATUS_LABELS[status] || status,
    }));
  }, [contracts]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Статусы договоров</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyText text="Нет договоров" />
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={STATUS_COLORS[d.status] || "var(--primary)"} />
                  ))}
                </Pie>
                <RTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpiringLists({ contracts }: { contracts: Contract[] }) {
  const buckets = useMemo(() => {
    const b: { [k: string]: Contract[] } = { "0-30": [], "31-60": [], "61-90": [] };
    contracts
      .filter((c) => c.status === "active")
      .forEach((c) => {
        const d = daysUntil(c.end_date);
        if (d === null) return;
        if (d >= 0 && d <= 30) b["0-30"].push(c);
        else if (d <= 60) b["31-60"].push(c);
        else if (d <= 90) b["61-90"].push(c);
      });
    return b;
  }, [contracts]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Истекающие договоры</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["0-30", "31-60", "61-90"] as const).map((k) => (
          <div key={k}>
            <div className="text-xs font-semibold mb-1">
              <span
                className={
                  k === "0-30" ? "text-destructive" : k === "31-60" ? "text-warning" : "text-info"
                }
              >
                {k === "0-30" ? "0–30" : k === "31-60" ? "31–60" : "61–90"} дней
              </span>{" "}
              <span className="text-muted-foreground">({buckets[k].length})</span>
            </div>
            {buckets[k].length === 0 ? (
              <div className="text-xs text-muted-foreground">—</div>
            ) : (
              <ul className="space-y-1">
                {buckets[k].slice(0, 5).map((c) => (
                  <li key={c.id} className="text-sm flex items-center justify-between gap-2">
                    <Link
                      to="/contracts/$id"
                      params={{ id: c.id }}
                      className="hover:underline truncate"
                    >
                      № {c.number} — {c.tenant?.name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(c.end_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RateHistoryTable({ contracts }: { contracts: Contract[] }) {
  const rows = useMemo(() => {
    const byProp = new Map<string, Contract[]>();
    contracts.forEach((c) => {
      const arr = byProp.get(c.property_id) || [];
      arr.push(c);
      byProp.set(c.property_id, arr);
    });
    const out: {
      property: string;
      date: string;
      oldRate: number;
      newRate: number;
      delta: number;
    }[] = [];
    byProp.forEach((list) => {
      const sorted = [...list].sort((a, b) => a.start_date.localeCompare(b.start_date));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        const o = monthlyFromRate(Number(prev.rate), prev.payment_period);
        const n = monthlyFromRate(Number(cur.rate), cur.payment_period);
        if (o === 0 && n === 0) continue;
        out.push({
          property: cur.property?.name || "—",
          date: cur.start_date,
          oldRate: o,
          newRate: n,
          delta: o > 0 ? ((n - o) / o) * 100 : 0,
        });
      }
    });
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [contracts]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">История индексаций ставок</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyText text="Недостаточно данных — нужно ≥2 договора по объекту." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-2">Дата</th>
                  <th className="p-2">Объект</th>
                  <th className="p-2 text-right">Старая</th>
                  <th className="p-2 text-right">Новая</th>
                  <th className="p-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{formatDate(r.date)}</td>
                    <td className="p-2 truncate max-w-[200px]">{r.property}</td>
                    <td className="p-2 text-right tabular-nums">{formatNum(r.oldRate)}</td>
                    <td className="p-2 text-right tabular-nums">{formatNum(r.newRate)}</td>
                    <td
                      className={`p-2 text-right tabular-nums ${r.delta >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {r.delta >= 0 ? "+" : ""}
                      {r.delta.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlaceholderCard({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyText text={text} />
      </CardContent>
    </Card>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{text}</div>;
}

function ArSection({
  charges,
  contracts,
  payments,
  periodStart,
  periodEnd,
}: {
  charges: Charge[];
  contracts: Contract[];
  payments: Payment[];
  periodStart: Date;
  periodEnd: Date;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const debt = useMemo(() => {
    let total = 0;
    const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const byContract = new Map<string, { debt: number; maxDays: number }>();
    charges.forEach((c) => {
      const remain = Number(c.total) - Number(c.paid_total);
      if (remain <= 0 || !c.due_date) return;
      const days = Math.floor((today.getTime() - new Date(c.due_date).getTime()) / 86400000);
      if (days < 0) return;
      total += remain;
      if (days <= 30) aging["0-30"] += remain;
      else if (days <= 60) aging["31-60"] += remain;
      else if (days <= 90) aging["61-90"] += remain;
      else aging["90+"] += remain;
      const e = byContract.get(c.contract_id) || { debt: 0, maxDays: 0 };
      e.debt += remain;
      e.maxDays = Math.max(e.maxDays, days);
      byContract.set(c.contract_id, e);
    });
    return { total, aging, byContract };
  }, [charges, today]);

  const periodCharges = charges.filter((c) => {
    const d = new Date(c.period_end);
    return d >= periodStart && d <= periodEnd;
  });
  const billed = periodCharges.reduce((s, c) => s + Number(c.total), 0);
  const paid = payments
    .filter((p) => {
      const d = new Date(p.paid_at);
      return d >= periodStart && d <= periodEnd;
    })
    .reduce((s, p) => s + Number(p.amount), 0);
  const collectionRate = billed > 0 ? (paid / billed) * 100 : 0;

  const debtors = Array.from(debt.byContract.entries())
    .map(([cid, v]) => {
      const ct = contracts.find((c) => c.id === cid);
      return {
        cid,
        tenant: ct?.tenant?.name || "—",
        property: ct?.property?.name || "—",
        debt: v.debt,
        days: v.maxDays,
      };
    })
    .sort((a, b) => b.debt - a.debt)
    .slice(0, 10);

  const agingData = [
    { bucket: "0–30", value: debt.aging["0-30"] },
    { bucket: "31–60", value: debt.aging["31-60"] },
    { bucket: "61–90", value: debt.aging["61-90"] },
    { bucket: ">90", value: debt.aging["90+"] },
  ];

  const recentPayments = [...payments]
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    .slice(0, 10);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aging задолженности</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Kpi
              icon={AlertTriangle}
              label="Общий долг"
              value={formatMoney(debt.total)}
              tone={debt.total > 0 ? "danger" : "ok"}
            />
            <Kpi
              icon={Percent}
              label="Сбор платежей"
              value={`${collectionRate.toFixed(1)}%`}
              tone={collectionRate >= 90 ? "ok" : collectionRate >= 70 ? "warn" : "danger"}
            />
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <RTooltip formatter={(v: any) => formatMoney(Number(v))} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {agingData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        i === 0
                          ? "var(--success)"
                          : i === 1
                            ? "var(--warning)"
                            : "var(--destructive)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Топ должников</CardTitle>
        </CardHeader>
        <CardContent>
          {debtors.length === 0 ? (
            <EmptyText text="Просрочек нет" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-2">Арендатор</th>
                    <th className="p-2">Объект</th>
                    <th className="p-2 text-right">Долг</th>
                    <th className="p-2 text-right">Просрочка</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map((d) => (
                    <tr key={d.cid} className="border-b">
                      <td className="p-2 truncate max-w-[160px]">{d.tenant}</td>
                      <td className="p-2 truncate max-w-[160px] text-muted-foreground">
                        {d.property}
                      </td>
                      <td className="p-2 text-right tabular-nums text-destructive font-medium">
                        {formatMoney(d.debt)}
                      </td>
                      <td className="p-2 text-right tabular-nums">{d.days} дн.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Последние платежи</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPayments.length === 0 ? (
            <EmptyText text="Платежей нет" />
          ) : (
            <ul className="divide-y">
              {recentPayments.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{formatDate(p.paid_at)}</span>
                  <span className="font-medium tabular-nums">{formatMoney(p.amount)}</span>
                  <span className="text-xs text-muted-foreground">{p.method || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FinanceSection({
  payments,
  properties,
  contracts,
  periodStart,
  periodEnd,
}: {
  payments: Payment[];
  properties: Property[];
  contracts: Contract[];
  periodStart: Date;
  periodEnd: Date;
}) {
  const monthly = useMemo(() => {
    const m = new Map<string, number>();
    payments
      .filter((p) => {
        const d = new Date(p.paid_at);
        return d >= periodStart && d <= periodEnd;
      })
      .forEach((p) => {
        const d = new Date(p.paid_at);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        m.set(k, (m.get(k) || 0) + Number(p.amount));
      });
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value }));
  }, [payments, periodStart, periodEnd]);

  const vacancyByType = useMemo(() => {
    const m = new Map<string, { total: number; leased: number }>();
    properties.forEach((p) => {
      const e = m.get(p.type) || { total: 0, leased: 0 };
      e.total += Number(p.area_total || 0);
      m.set(p.type, e);
    });
    contracts
      .filter((c) => c.status === "active")
      .forEach((c) => {
        const t = c.property?.type;
        if (!t) return;
        const e = m.get(t) || { total: 0, leased: 0 };
        e.leased += Number(c.area || 0);
        m.set(t, e);
      });
    return Array.from(m.entries()).map(([type, v]) => ({
      type: PROPERTY_TYPE_LABELS[type] || type,
      vacancy: v.total > 0 ? ((v.total - v.leased) / v.total) * 100 : 0,
    }));
  }, [properties, contracts]);

  const areaByType = useMemo(() => {
    const m = new Map<string, number>();
    properties.forEach((p) => {
      m.set(p.type, (m.get(p.type) || 0) + Number(p.area_total || 0));
    });
    return Array.from(m.entries())
      .map(([type, area]) => ({
        type: PROPERTY_TYPE_LABELS[type] || type,
        area,
      }))
      .sort((a, b) => b.area - a.area);
  }, [properties]);

  const avgRateByType = useMemo(() => {
    const m = new Map<string, { num: number; den: number }>();
    contracts
      .filter((c) => c.status === "active")
      .forEach((c) => {
        const t = c.property?.type;
        if (!t) return;
        const monthly = monthlyFromRate(Number(c.rate), c.payment_period);
        const area = Number(c.area || 0);
        if (area <= 0) return;
        const e = m.get(t) || { num: 0, den: 0 };
        e.num += monthly * area;
        e.den += area;
        m.set(t, e);
      });
    return Array.from(m.entries())
      .map(([type, v]) => ({
        type: PROPERTY_TYPE_LABELS[type] || type,
        rate: v.den > 0 ? v.num / v.den : 0,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [contracts]);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Динамика арендного дохода</CardTitle>
        </CardHeader>
        <CardContent>
          {monthly.length === 0 ? (
            <EmptyText text="Нет платежей за период" />
          ) : (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RTooltip formatter={(v: any) => formatMoney(Number(v))} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--info)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Вакантность по типам объектов</CardTitle>
        </CardHeader>
        <CardContent>
          {vacancyByType.length === 0 ? (
            <EmptyText text="Нет данных" />
          ) : (
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={vacancyByType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 12 }} width={100} />
                  <RTooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="vacancy" fill="var(--warning)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Общая площадь по типам объектов</CardTitle>
        </CardHeader>
        <CardContent>
          {areaByType.length === 0 ? (
            <EmptyText text="Нет данных" />
          ) : (
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={areaByType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} unit=" м²" />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 12 }} width={100} />
                  <RTooltip formatter={(v: any) => `${formatNum(Number(v))} м²`} />
                  <Bar dataKey="area" fill="var(--info)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Средняя ставка по типам объектов</CardTitle>
        </CardHeader>
        <CardContent>
          {avgRateByType.length === 0 ? (
            <EmptyText text="Нет активных договоров" />
          ) : (
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={avgRateByType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 12 }} width={100} />
                  <RTooltip
                    formatter={(v: any) => `${formatNum(Number(v))} ₽/м²/мес`}
                  />
                  <Bar dataKey="rate" fill="var(--success)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <PlaceholderCard
        title="NOI (чистый операционный доход)"
        text="Нет источника данных об операционных расходах."
      />
      <PlaceholderCard
        title="План vs Факт"
        text="Плановые показатели не заданы — добавьте источник плана."
      />
      <PlaceholderCard
        title="Структура операционных расходов"
        text="Нет источника данных о расходах."
      />
    </div>
  );
}