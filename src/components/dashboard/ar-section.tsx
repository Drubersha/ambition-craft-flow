/** Дебиторская задолженность: aging, собираемость, топ должников, последние платежи. */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { AlertTriangle, Percent } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatDate,
  formatMoney,
  formatMonthKey,
  monthKeyOf,
  monthKeysBetween,
} from "@/lib/format";
import { computeCollectionRate, type Charge, type Contract, type Payment } from "@/lib/dashboard";
import { EmptyText, Kpi } from "./ui";

export function ArSection({
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
    // Общий долг — сальдо по договорам, как в 1С: сумма положительных
    // сальдо (начислено − оплачено), переплаты внутри договора вычитаются.
    // Aging — отдельно, только по просроченным начислениям.
    const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const byContract = new Map<string, { debt: number; maxDays: number }>();
    charges.forEach((c) => {
      const remain = Number(c.total) - Number(c.paid_total);
      const e = byContract.get(c.contract_id) || { debt: 0, maxDays: 0 };
      e.debt += remain;
      if (remain > 0 && c.due_date) {
        const days = Math.floor((today.getTime() - new Date(c.due_date).getTime()) / 86400000);
        if (days >= 0) {
          e.maxDays = Math.max(e.maxDays, days);
          if (days <= 30) aging["0-30"] += remain;
          else if (days <= 60) aging["31-60"] += remain;
          else if (days <= 90) aging["61-90"] += remain;
          else aging["90+"] += remain;
        }
      }
      byContract.set(c.contract_id, e);
    });
    let total = 0;
    for (const [cid, e] of Array.from(byContract.entries())) {
      if (e.debt > 0.005) total += e.debt;
      else byContract.delete(cid);
    }
    return { total: Math.round(total * 100) / 100, aging, byContract };
  }, [charges, today]);

  const periodCharges = charges.filter((c) => {
    const d = new Date(c.period_end);
    return d >= periodStart && d <= periodEnd;
  });
  // По оплате самих начислений периода: платежи, гасящие долги прошлых
  // месяцев, к собираемости текущего отношения не имеют.
  const { billed, rate } = computeCollectionRate(periodCharges);
  const collectionRate = rate ?? 0;

  // Топ должников: группировка по арендатору, внутри — разбивка по договорам.
  const debtors = useMemo(() => {
    const byTenant = new Map<
      string,
      {
        tenant: string;
        debt: number;
        days: number;
        contracts: { cid: string; number: string; property: string; debt: number; days: number }[];
      }
    >();
    for (const [cid, v] of debt.byContract.entries()) {
      const ct = contracts.find((c) => c.id === cid);
      const tid = ct?.tenant?.id ?? cid;
      const e = byTenant.get(tid) ?? {
        tenant: ct?.tenant?.name || "—",
        debt: 0,
        days: 0,
        contracts: [],
      };
      e.debt += v.debt;
      e.days = Math.max(e.days, v.maxDays);
      e.contracts.push({
        cid,
        number: ct?.number || "—",
        property: ct?.property?.name || "—",
        debt: v.debt,
        days: v.maxDays,
      });
      byTenant.set(tid, e);
    }
    return Array.from(byTenant.values())
      .map((e) => ({ ...e, contracts: e.contracts.sort((a, b) => b.debt - a.debt) }))
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 10);
  }, [debt, contracts]);

  const agingData = [
    { bucket: "0–30", value: debt.aging["0-30"] },
    { bucket: "31–60", value: debt.aging["31-60"] },
    { bucket: "61–90", value: debt.aging["61-90"] },
    { bucket: ">90", value: debt.aging["90+"] },
  ];

  const recentPayments = [...payments]
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    .slice(0, 10);

  // При периоде от двух месяцев — помесячная собираемость.
  const billedVsPaid = useMemo(() => {
    const keys = monthKeysBetween(periodStart, periodEnd);
    if (keys.length < 2) return [];
    const billedBy = new Map<string, number>();
    for (const c of charges) {
      const d = new Date(c.period_end);
      if (d < periodStart || d > periodEnd) continue;
      const k = monthKeyOf(c.period_end);
      billedBy.set(k, (billedBy.get(k) ?? 0) + Number(c.total));
    }
    const paidBy = new Map<string, number>();
    for (const p of payments) {
      const d = new Date(p.paid_at);
      if (d < periodStart || d > periodEnd) continue;
      const k = monthKeyOf(p.paid_at);
      paidBy.set(k, (paidBy.get(k) ?? 0) + Number(p.amount));
    }
    return keys.map((k) => ({
      month: formatMonthKey(k, "2-digit"),
      Начислено: Math.round(billedBy.get(k) ?? 0),
      Оплачено: Math.round(paidBy.get(k) ?? 0),
    }));
  }, [charges, payments, periodStart, periodEnd]);

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Aging задолженности</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Kpi
              icon={AlertTriangle}
              label="Общий долг"
              value={formatMoney(debt.total)}
              tone={debt.total > 0 ? "danger" : "ok"}
              hint="Сальдо по договорам, как в 1С: начислено − оплачено, только должники (переплаты внутри договора вычитаются, авансы других договоров не учитываются)."
            />
            <Kpi
              icon={Percent}
              label="Сбор платежей"
              value={`${collectionRate.toFixed(1)}%`}
              tone={collectionRate >= 90 ? "ok" : collectionRate >= 70 ? "warn" : "danger"}
            />
          </div>
          <div style={{ width: "100%", height: 190 }}>
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

      {billedVsPaid.length >= 2 && (
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Начислено vs оплачено по месяцам</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div style={{ width: "100%", height: 210 }}>
              <ResponsiveContainer>
                <BarChart data={billedVsPaid}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RTooltip formatter={(v: any) => formatMoney(Number(v))} />
                  <Legend />
                  <Bar dataKey="Начислено" fill="var(--info)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Оплачено" fill="var(--success)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Разрыв между столбцами — недосбор соответствующего месяца.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Топ должников</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {debtors.length === 0 ? (
            <EmptyText text="Просрочек нет" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-2">Арендатор</th>
                    <th className="p-2 text-right">Договоров</th>
                    <th className="p-2 text-right">Долг</th>
                    <th className="p-2 text-right">Просрочка</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map((d) => (
                    <HoverCard key={d.tenant} openDelay={150} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <tr className="border-b cursor-help hover:bg-accent/50">
                          <td className="p-2 truncate max-w-[180px]">{d.tenant}</td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">
                            {d.contracts.length}
                          </td>
                          <td className="p-2 text-right tabular-nums text-destructive font-medium">
                            {formatMoney(d.debt)}
                          </td>
                          <td className="p-2 text-right tabular-nums">{d.days} дн.</td>
                        </tr>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80 p-3" side="left">
                        <div className="text-xs font-semibold mb-2 truncate">{d.tenant}</div>
                        <div className="space-y-1.5">
                          {d.contracts.map((c) => (
                            <div
                              key={c.cid}
                              className="flex items-start justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <Link
                                  to="/contracts/$id"
                                  params={{ id: c.cid }}
                                  className="hover:underline font-medium"
                                >
                                  № {c.number}
                                </Link>
                                <div className="text-muted-foreground truncate">{c.property}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="tabular-nums text-destructive font-medium">
                                  {formatMoney(c.debt)}
                                </div>
                                <div className="text-muted-foreground tabular-nums">
                                  {c.days} дн.
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Последние платежи</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
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
