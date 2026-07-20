/**
 * Оперативная сводка всегда про текущий календарный месяц — независимо от
 * выбранного сверху периода: «что требует внимания прямо сейчас».
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CalendarClock, Gauge, Percent, TrendingDown, Wallet } from "lucide-react";
import { formatMoney, formatNum } from "@/lib/format";
import type { Charge, Contract, Payment, Property } from "@/lib/dashboard";
import { Kpi } from "./ui";

export function CurrentMonthOps({
  charges,
  contracts,
  payments,
  properties,
  ahchContracts,
}: {
  charges: Charge[];
  contracts: Contract[];
  payments: Payment[];
  properties: Property[];
  ahchContracts: Contract[];
}) {
  const { data: metersData } = useQuery({
    queryKey: ["dashboard-meters"],
    queryFn: async () => {
      const [me, re] = await Promise.all([
        supabase.from("meters").select("id").eq("active", true),
        supabase.from("meter_readings").select("meter_id, read_at"),
      ]);
      if (me.error) throw me.error;
      if (re.error) throw re.error;
      return { meters: me.data ?? [], readings: re.data ?? [] };
    },
  });

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = new Date(y, m, now.getDate());
  const inThisMonth = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };

  const stats = useMemo(() => {
    const billed = charges
      .filter((c) => inThisMonth(c.period_end))
      .reduce((s, c) => s + Number(c.total), 0);
    const paid = payments
      .filter((p) => inThisMonth(p.paid_at))
      .reduce((s, p) => s + Number(p.amount), 0);
    const collection = billed > 0 ? Math.min(100, (paid / billed) * 100) : null;

    let dueSoon = 0;
    let overdueSum = 0;
    let overdueCount = 0;
    for (const c of charges) {
      const remain = Number(c.total) - Number(c.paid_total);
      if (remain <= 0 || !c.due_date) continue;
      const due = new Date(c.due_date);
      if (due < today) {
        overdueSum += remain;
        overdueCount++;
      } else if (inThisMonth(c.due_date)) {
        dueSoon += remain;
      }
    }

    const expiring = contracts.filter(
      (c) => c.status === "active" && inThisMonth(c.end_date),
    ).length;

    // Недополученный доход: свободная площадь × базовая ставка объекта.
    const leasedByProp = new Map<string, number>();
    for (const c of contracts) {
      if (c.status !== "active") continue;
      leasedByProp.set(c.property_id, (leasedByProp.get(c.property_id) ?? 0) + Number(c.area || 0));
    }
    for (const c of ahchContracts) {
      if (c.status !== "active") continue;
      leasedByProp.set(c.property_id, (leasedByProp.get(c.property_id) ?? 0) + Number(c.area || 0));
    }
    let vacantArea = 0;
    let vacantIncome = 0;
    for (const p of properties) {
      const free = Math.max(0, Number(p.area_total || 0) - (leasedByProp.get(p.id) ?? 0));
      vacantArea += free;
      vacantIncome += free * Number(p.base_rate || 0);
    }

    return {
      billed,
      paid,
      collection,
      dueSoon,
      overdueSum,
      overdueCount,
      expiring,
      vacantArea,
      vacantIncome,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges, contracts, payments, properties, ahchContracts]);

  const metersNoReading = useMemo(() => {
    if (!metersData) return null;
    const withReading = new Set(
      metersData.readings.filter((r) => inThisMonth(r.read_at)).map((r) => r.meter_id),
    );
    return metersData.meters.filter((mm) => !withReading.has(mm.id)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metersData]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
      <Kpi
        icon={Percent}
        label="Собираемость месяца"
        value={stats.collection === null ? "—" : `${stats.collection.toFixed(0)}%`}
        tone={
          stats.collection === null
            ? undefined
            : stats.collection >= 90
              ? "ok"
              : stats.collection >= 70
                ? "warn"
                : "danger"
        }
        sub={
          <div className="mt-1 space-y-1">
            {stats.collection !== null && <Progress value={stats.collection} className="h-1.5" />}
            <div className="text-[11px] text-muted-foreground">
              {formatMoney(stats.paid)} из {formatMoney(stats.billed)}
            </div>
          </div>
        }
      />
      <Kpi
        icon={Wallet}
        label="Ждём до конца месяца"
        value={formatMoney(stats.dueSoon)}
        hint="Неоплаченные начисления со сроком оплаты до конца текущего месяца."
      />
      <Kpi
        icon={AlertTriangle}
        label="Просрочено всего"
        value={formatMoney(stats.overdueSum)}
        tone={stats.overdueSum > 0 ? "danger" : "ok"}
        sub={
          stats.overdueCount > 0 ? (
            <div className="text-[11px] text-muted-foreground mt-1">
              {stats.overdueCount} начислений(я)
            </div>
          ) : undefined
        }
      />
      <Kpi
        icon={Gauge}
        label="Счётчики без показаний"
        value={metersNoReading === null ? "…" : metersNoReading}
        tone={metersNoReading ? "warn" : "ok"}
        sub={
          <Link to="/utilities" className="text-[11px] underline text-muted-foreground">
            Открыть коммуналку
          </Link>
        }
      />
      <Kpi
        icon={CalendarClock}
        label="Договоры истекают в этом месяце"
        value={stats.expiring}
        tone={stats.expiring > 0 ? "warn" : "ok"}
      />
      <Kpi
        icon={TrendingDown}
        label="Потенциал свободных площадей"
        value={formatMoney(stats.vacantIncome)}
        sub={
          <div className="text-[11px] text-muted-foreground mt-1">
            {formatNum(stats.vacantArea)} м² свободно × базовая ставка, в месяц
          </div>
        }
      />
    </div>
  );
}
