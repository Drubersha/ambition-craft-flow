import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { OnboardingQuest } from "@/components/onboarding-quest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  formatDate,
  formatMoney,
  formatNum,
} from "@/lib/format";
import {
  computeKpi,
  filterDashboardData,
  getPeriodRange,
  occupancyTone,
  periodLabel,
  type Charge,
  type Contract,
  type Payment,
  type Period,
  type Property,
} from "@/lib/dashboard";
import { Kpi, MultiSelectPopover, PlaceholderCard, Section } from "@/components/dashboard/ui";
import { PropertiesTable } from "@/components/dashboard/properties-table";
import { ExpiringLists, RateHistoryTable } from "@/components/dashboard/contracts-cards";
import { ArSection } from "@/components/dashboard/ar-section";
import { FinanceSection } from "@/components/dashboard/finance-section";
import { CurrentMonthOps } from "@/components/dashboard/current-month-ops";
import { ProfitSummary } from "@/components/dashboard/profit-summary";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Filter,
  Percent,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

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
        supabase.from("properties").select("id,name,type,status,area_total,base_rate,currency"),
        supabase
          .from("contracts")
          .select(
            "id,number,status,kind,start_date,end_date,rate,area,payment_period,currency,property_id,tenant_id,tenant:tenants(id,name),property:properties(id,name,type,area_total)",
          ),
        supabase
          .from("charges")
          .select("id,contract_id,total,paid_total,status,due_date,period_start,period_end"),
        supabase.from("payments").select("id,charge_id,amount,paid_at,method"),
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

  const filtered = useMemo(
    () =>
      filterDashboardData(data, {
        properties: selectedProps,
        types: selectedTypes,
        statuses: selectedStatuses,
      }),
    [data, selectedProps, selectedTypes, selectedStatuses],
  );

  const kpi = useMemo(
    () => computeKpi(filtered, periodStart, periodEnd),
    [filtered, periodStart, periodEnd],
  );

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
    occupancy: `${formatNum(leasedAreaHint)} м² занято по ${activeContractsForHint.length} активным договорам / ${formatNum(kpi.totalArea - kpi.ahchArea)} м² общая без АХЧ.`,
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Дашборд</h1>
          <p className="text-xs text-muted-foreground">
            Обновлено: {data.loadedAt.toLocaleTimeString("ru-RU")} · Период:{" "}
            {formatDate(periodStart.toISOString())} — {formatDate(periodEnd.toISOString())}
          </p>
        </div>
      </div>

      <OnboardingQuest variant="owner" />

      {/* Global filters */}
      <Card>
        <CardContent className="p-3 space-y-2">
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
                    aria-label={`Удалить фильтр: ${c.label}`}
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <Kpi
            icon={Building2}
            label="Общая площадь"
            value={`${formatNum(kpi.totalArea)} м²`}
            hint={showKpiHints ? kpiHints.totalArea : undefined}
          />
          <Kpi
            icon={Building2}
            label="Объектов"
            value={kpi.propsCount}
            hint={showKpiHints ? kpiHints.propsCount : undefined}
          />
          <Kpi
            icon={Percent}
            label="Занятость"
            value={`${kpi.occupancy.toFixed(1)}%`}
            tone={occupancyTone(kpi.occupancy)}
            sub={<Progress value={kpi.occupancy} className="mt-2 h-1.5" />}
            hint={showKpiHints ? kpiHints.occupancy : undefined}
          />
          <Kpi
            icon={Wallet}
            label="Арендный доход"
            value={formatMoney(kpi.rentIncome)}
            hint={showKpiHints ? kpiHints.rentIncome : undefined}
          />
          <Kpi
            icon={Wallet}
            label="Месячные платежи"
            value={formatMoney(kpi.monthlyIncome)}
            hint={showKpiHints ? kpiHints.monthlyIncome : undefined}
          />
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

      {/* Block 1a2: operational snapshot of the current month */}
      <Section title="Оперативно: текущий месяц">
        <CurrentMonthOps
          charges={filtered.charges}
          contracts={filtered.contracts}
          payments={filtered.payments}
          properties={filtered.properties}
          ahchContracts={filtered.ahchContracts}
        />
      </Section>

      {/* Block 1b: Income, Expenses, Profit */}
      <Section title="Доходы, расходы и прибыль">
        <ProfitSummary periodStart={periodStart} periodEnd={periodEnd} />
      </Section>

      {/* Block 2: AR (выше объектов — оперативно важнее) */}
      <Section title="Дебиторская задолженность">
        <ArSection
          charges={filtered.charges}
          contracts={filtered.contracts}
          payments={filtered.payments}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      </Section>

      {/* Block 3: Properties table */}
      <Section title="Объекты и помещения">
        <Card>
          <CardContent className="p-3 space-y-2">
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
        <div className="grid lg:grid-cols-2 gap-3">
          <ExpiringLists contracts={filtered.contracts} />
          <RateHistoryTable contracts={filtered.contracts} />
          <PlaceholderCard
            title="Воронка новых арендаторов"
            text="Источник данных по лидам/просмотрам/переговорам не подключён."
          />
        </div>
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
