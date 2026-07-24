import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OnboardingQuest } from "@/components/onboarding-quest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS, formatDate } from "@/lib/format";
import {
  computeCollectionRate,
  computeContourDebt,
  computeContourYear,
  computeKpi,
  filterDashboardData,
  getPeriodRange,
  periodLabel,
  splitByCurrentMonth,
  type Charge,
  type Contract,
  type ContractLink,
  type Payment,
  type Period,
  type Property,
} from "@/lib/dashboard";
import {
  CollapsibleSection,
  MultiSelectPopover,
  PlaceholderCard,
  Section,
} from "@/components/dashboard/ui";
import { OverviewSummary } from "@/components/dashboard/overview-summary";
import { ContourPanel } from "@/components/dashboard/contour-panel";
import { PropertiesTable } from "@/components/dashboard/properties-table";
import { ExpiringLists, RateHistoryTable } from "@/components/dashboard/contracts-cards";
import { ArSection } from "@/components/dashboard/ar-section";
import { FinanceSection } from "@/components/dashboard/finance-section";
import { CurrentMonthOps } from "@/components/dashboard/current-month-ops";
import { ProfitSummary } from "@/components/dashboard/profit-summary";
import { Filter, X } from "lucide-react";

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
      const [pr, co, ch, py, cl] = await Promise.all([
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
        supabase.from("contract_properties").select("contract_id,property_id,area"),
      ]);
      if (pr.error) throw pr.error;
      if (co.error) throw co.error;
      if (ch.error) throw ch.error;
      if (py.error) throw py.error;
      if (cl.error) throw cl.error;
      return {
        properties: (pr.data ?? []) as Property[],
        contracts: (co.data ?? []) as unknown as Contract[],
        charges: (ch.data ?? []) as Charge[],
        payments: (py.data ?? []) as Payment[],
        contractLinks: (cl.data ?? []) as ContractLink[],
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
    () => computeKpi(filtered, periodStart, periodEnd, data?.contractLinks),
    [filtered, periodStart, periodEnd, data?.contractLinks],
  );

  // Собираемость текущего календарного месяца — только по его начислениям.
  const collectionRate = useMemo(() => {
    const { current } = splitByCurrentMonth(filtered.charges, new Date());
    return computeCollectionRate(current).rate;
  }, [filtered]);

  // Годовые ряды и долг по контурам для панелей.
  const contourYear = useMemo(
    () => computeContourYear(filtered, data?.contractLinks, new Date()),
    [filtered, data?.contractLinks],
  );
  const contourDebt = useMemo(() => computeContourDebt(filtered, new Date()), [filtered]);

  if (isLoading) return <div className="p-6">Загрузка…</div>;
  if (!data) return null;

  const perLabel = periodLabel(period);
  const allTypes = Array.from(new Set(data.properties.map((p) => p.type)));
  const allStatuses = Array.from(new Set(data.properties.map((p) => p.status)));

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

      {/* Общее — сквозные показатели за 5 секунд */}
      <Section
        title="Общее"
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
        <OverviewSummary
          kpi={kpi}
          collectionRate={collectionRate}
          periodLabel={perLabel}
          showHints={showKpiHints}
        />
      </Section>

      {/* Контуры — состояние сейчас и графики за год */}
      <Section title="Контуры — состояние и динамика за год">
        <div className="space-y-3">
          {kpi.areas.length === 0 ? (
            <PlaceholderCard
              title="Нет объектов"
              text="Под текущими фильтрами объектов нет — измените фильтры выше."
            />
          ) : (
            kpi.areas.map((a) => (
              <ContourPanel
                key={a.label}
                area={a}
                rate={kpi.avgRates.find((r) => r.label === a.label)}
                income={kpi.incomes.find((i) => i.label === a.label)}
                debt={contourDebt.get(a.label) ?? 0}
                series={contourYear.get(a.label) ?? []}
                periodLabel={perLabel}
              />
            ))
          )}
        </div>
      </Section>

      {/* Подробные разделы — под катом, монтируются при раскрытии */}
      <CollapsibleSection title="Оперативно: текущий месяц">
        <CurrentMonthOps
          charges={filtered.charges}
          contracts={filtered.contracts}
          payments={filtered.payments}
          properties={filtered.properties}
          ahchContracts={filtered.ahchContracts}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Доходы, расходы и прибыль">
        <ProfitSummary periodStart={periodStart} periodEnd={periodEnd} />
      </CollapsibleSection>

      <CollapsibleSection title="Дебиторская задолженность">
        <ArSection
          charges={filtered.charges}
          contracts={filtered.contracts}
          payments={filtered.payments}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Объекты и помещения">
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
      </CollapsibleSection>

      <CollapsibleSection title="Договорная база">
        <div className="grid lg:grid-cols-2 gap-3">
          <ExpiringLists contracts={filtered.contracts} />
          <RateHistoryTable contracts={filtered.contracts} />
          <PlaceholderCard
            title="Воронка новых арендаторов"
            text="Источник данных по лидам/просмотрам/переговорам не подключён."
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Финансовые показатели">
        <FinanceSection
          payments={filtered.payments}
          properties={filtered.properties}
          contracts={filtered.contracts}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      </CollapsibleSection>
    </div>
  );
}
