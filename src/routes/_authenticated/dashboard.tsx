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
import {
  ContourBreakdown,
  Kpi,
  MultiSelectPopover,
  PlaceholderCard,
  Section,
} from "@/components/dashboard/ui";
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
  Gauge,
  Percent,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

/** Контуры, кроме помещений: они выносятся в подстрочник, помещения — в основную цифру. */
function otherContours<T extends { label: string }>(items: T[]): T[] {
  return items.filter((i) => i.label !== "Помещения");
}

/** Доля от общей площади контура — «—», когда делить не на что. */
function share(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
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
  const premises = kpi.areas.find((a) => a.label === "Помещения");
  const periodPaymentsHint = filtered.payments.filter((p) => {
    const d = new Date(p.paid_at);
    return d >= periodStart && d <= periodEnd;
  });
  const kpiHints: Record<string, string> = {
    totalArea: `Площади ${filtered.properties.length} объектов(а) в фильтре, раздельно по контурам: ${kpi.areas
      .map((a) => `${a.label} — ${formatNum(a.total)} ${a.unit}`)
      .join(", ")}. Метры офиса, склада и земли неравноценны, поэтому общий итог не выводится.`,
    propsCount: `Объекты под текущими фильтрами, по контурам: ${kpi.areas
      .map((a) => `${a.label} — ${a.properties}`)
      .join(", ")}.`,
    occupancy: `Занятость каждого контура — сданная площадь к площади контура без АХЧ: ${kpi.areas
      .filter((a) => a.occupancy !== null)
      .map((a) => `${a.label} — ${formatNum(a.leased)} из ${formatNum(a.total - a.ahch)} ${a.unit}`)
      .join("; ")}. Всего ${activeContractsForHint.length} активных договоров.`,
    rentIncome: `Сумма ${periodPaymentsHint.length} платежей за период ${formatDate(periodStart.toISOString())} — ${formatDate(periodEnd.toISOString())}; в подстрочнике — разбивка по контурам (платёж относится к контуру через начисление и договор).`,
    monthlyIncome: `Сумма месячных платежей по ${activeContractsForHint.length} активным договорам (ставка × площадь, без АХЧ), в подстрочнике — по контурам.`,
    avgRate: `Средневзвешенные по площади ставки активных договоров, раздельно по контурам: помещения и земля — ₽/м², машиноместа — ₽/место. Договоры с фиксированной суммой (площадь 1) искажают ставку своего контура.`,
    overdueAmt: `Неоплаченная дебиторка прошлых периодов по срокам давности: ${kpi.aging.buckets
      .map((b) => `${b.label} — ${formatMoney(b.amount)} (${b.count})`)
      .join(
        "; ",
      )}. Корзины складываются в общий долг ${formatMoney(kpi.aging.total)}, из них просрочено ${formatMoney(kpi.aging.overdue)}. Начисления текущего месяца сюда не входят и показаны отдельной строкой (${formatMoney(kpi.currentMonthUnpaid)}).`,
    expSoon: `Активные договоры с датой окончания в ближайшие 90 дней.`,
    rentable: premises
      ? `Площадь помещений, доступная к сдаче: ${formatNum(premises.total)} м² всего минус ${formatNum(premises.ahch)} м² под собственные нужды (АХЧ). ` +
        `Сдано ${formatNum(premises.leased)} м², свободно ${formatNum(premises.free)} м². Проценты сдано/свободно — доли от потенциала сдачи (вместе дают 100%), АХЧ — от общей площади.`
      : `Нет помещений под текущими фильтрами.`,
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
            label="Площадь: помещения"
            value={kpi.areas.length === 0 ? "—" : `${formatNum(kpi.premisesArea)} м²`}
            sub={
              <ContourBreakdown
                items={otherContours(kpi.areas).map((a) => ({
                  label: a.label,
                  text: `${formatNum(a.total)} ${a.unit}`,
                }))}
              />
            }
            hint={showKpiHints ? kpiHints.totalArea : undefined}
          />
          <Kpi
            icon={Gauge}
            label="Потенциал сдачи"
            value={premises ? `${formatNum(premises.rentable)} м²` : "—"}
            sub={
              premises ? (
                <ContourBreakdown
                  items={[
                    {
                      label: "Сдано",
                      text: `${formatNum(premises.leased)} м² · ${share(premises.leased, premises.rentable)}`,
                    },
                    {
                      label: "Свободно",
                      text: `${formatNum(premises.free)} м² · ${share(premises.free, premises.rentable)}`,
                    },
                    {
                      label: "АХЧ",
                      text: `${formatNum(premises.ahch)} м² · ${share(premises.ahch, premises.total)} от общей`,
                    },
                  ]}
                />
              ) : undefined
            }
            hint={showKpiHints ? kpiHints.rentable : undefined}
          />
          <Kpi
            icon={Building2}
            label="Объектов"
            value={kpi.propsCount}
            sub={
              <ContourBreakdown
                items={kpi.areas.map((a) => ({ label: a.label, text: String(a.properties) }))}
              />
            }
            hint={showKpiHints ? kpiHints.propsCount : undefined}
          />
          <Kpi
            icon={Percent}
            label="Занятость: помещения"
            value={kpi.premisesOccupancy === null ? "—" : `${kpi.premisesOccupancy.toFixed(1)}%`}
            tone={kpi.premisesOccupancy === null ? undefined : occupancyTone(kpi.premisesOccupancy)}
            sub={
              <>
                <Progress value={kpi.premisesOccupancy ?? 0} className="mt-2 h-1.5" />
                <ContourBreakdown
                  items={otherContours(kpi.areas)
                    .filter((a) => a.occupancy !== null)
                    .map((a) => ({ label: a.label, text: `${a.occupancy!.toFixed(1)}%` }))}
                />
              </>
            }
            hint={showKpiHints ? kpiHints.occupancy : undefined}
          />
          <Kpi
            icon={Wallet}
            label="Арендный доход"
            value={formatMoney(kpi.rentIncome)}
            sub={
              <ContourBreakdown
                items={kpi.incomes
                  .filter((i) => i.rentIncome > 0)
                  .map((i) => ({ label: i.label, text: formatMoney(i.rentIncome) }))}
              />
            }
            hint={showKpiHints ? kpiHints.rentIncome : undefined}
          />
          <Kpi
            icon={Wallet}
            label="Месячные платежи"
            value={formatMoney(kpi.monthlyIncome)}
            sub={
              <ContourBreakdown
                items={kpi.incomes
                  .filter((i) => i.monthlyIncome > 0)
                  .map((i) => ({ label: i.label, text: formatMoney(i.monthlyIncome) }))}
              />
            }
            hint={showKpiHints ? kpiHints.monthlyIncome : undefined}
          />
          <Kpi
            icon={TrendingUp}
            label="Ставка: помещения"
            value={kpi.avgRates.length === 0 ? "—" : `${formatNum(kpi.avgRate)} ₽/м²/мес`}
            sub={
              <ContourBreakdown
                items={otherContours(kpi.avgRates).map((r) => ({
                  label: r.label,
                  text: `${formatNum(r.rate)} ${r.unit}`,
                }))}
              />
            }
            hint={showKpiHints ? kpiHints.avgRate : undefined}
          />
          <Kpi
            icon={AlertTriangle}
            label="Дебиторка: всего"
            value={formatMoney(kpi.aging.total)}
            tone={kpi.overdueAmt > 0 ? "danger" : "ok"}
            sub={
              <ContourBreakdown
                items={[
                  ...kpi.aging.buckets.map((b) => ({
                    label: b.label,
                    text: formatMoney(b.amount),
                  })),
                  ...(kpi.currentMonthUnpaid > 0.005
                    ? [
                        {
                          label: "Не оплачено за текущий месяц",
                          text: formatMoney(kpi.currentMonthUnpaid),
                        },
                      ]
                    : []),
                ]}
              />
            }
            hint={showKpiHints ? kpiHints.overdueAmt : undefined}
          />
          <Kpi
            icon={CalendarClock}
            label="Истекают за 90 дн"
            value={kpi.expSoon}
            tone={kpi.expSoon > 0 ? "warn" : "ok"}
            hint={showKpiHints ? kpiHints.expSoon : undefined}
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
