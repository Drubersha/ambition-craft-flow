/** Финансовые показатели: динамика дохода, вакантность/площади/ставки по типам, занятость 12 мес. */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PROPERTY_TYPE_LABELS,
  formatMoney,
  formatMonthKey,
  formatNum,
  monthKey,
  monthlyFromRate,
} from "@/lib/format";
import type { Contract, Payment, Property } from "@/lib/dashboard";
import { EmptyText } from "./ui";
import { BudgetExpenseStructure, BudgetPlanVsFact } from "./budget-cards";

export function FinanceSection({
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
        const k = monthKey(new Date(p.paid_at));
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

  // Картина года: занятость по месяцам, восстановленная из дат договоров.
  const occupancy12m = useMemo(() => {
    const totalArea = properties.reduce((s, p) => s + Number(p.area_total || 0), 0);
    if (totalArea <= 0) return [];
    const now = new Date();
    const rows: { month: string; Занятость: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const leased = contracts.reduce((s, c) => {
        const started = new Date(c.start_date) <= mEnd;
        const notEnded = !c.end_date || new Date(c.end_date) >= mStart;
        return started && notEnded ? s + Number(c.area || 0) : s;
      }, 0);
      rows.push({
        month: formatMonthKey(monthKey(mStart), "2-digit"),
        Занятость: Math.round(Math.min(100, (leased / totalArea) * 100) * 10) / 10,
      });
    }
    return rows;
  }, [contracts, properties]);

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
        unit: type === "parking" ? "₽/место/мес" : "₽/м²/мес",
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [contracts]);

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <Card className="lg:col-span-2">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Динамика арендного дохода</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {monthly.length === 0 ? (
            <EmptyText text="Нет платежей за период" />
          ) : (
            <div style={{ width: "100%", height: 210 }}>
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
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Вакантность по типам объектов</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {vacancyByType.length === 0 ? (
            <EmptyText text="Нет данных" />
          ) : (
            <div style={{ width: "100%", height: 200 }}>
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
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Общая площадь по типам объектов</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {areaByType.length === 0 ? (
            <EmptyText text="Нет данных" />
          ) : (
            <div style={{ width: "100%", height: 200 }}>
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
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Средняя ставка по типам объектов</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {avgRateByType.length === 0 ? (
            <EmptyText text="Нет активных договоров" />
          ) : (
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={avgRateByType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 12 }} width={100} />
                  <RTooltip
                    formatter={(v: any, _n: any, item: any) =>
                      `${formatNum(Number(v))} ${item?.payload?.unit ?? "₽/м²/мес"}`
                    }
                  />
                  <Bar dataKey="rate" fill="var(--success)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {occupancy12m.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Занятость за 12 месяцев</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={occupancy12m}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} unit="%" />
                  <RTooltip formatter={(v: any) => `${v}%`} />
                  <Line
                    type="monotone"
                    dataKey="Занятость"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Доля сданной площади (по датам договоров аренды) от общей площади объектов в фильтре.
            </p>
          </CardContent>
        </Card>
      )}

      <BudgetPlanVsFact periodStart={periodStart} periodEnd={periodEnd} />
      <BudgetExpenseStructure periodStart={periodStart} periodEnd={periodEnd} />
    </div>
  );
}
