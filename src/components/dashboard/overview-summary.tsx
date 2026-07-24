/**
 * Блок «Общее»: сквозные по всем контурам показатели — только деньги и счётчики,
 * которые правомерно складывать между контурами (метры офиса, земли и мест
 * несопоставимы и живут в панелях контуров). Задача блока — дать картину за 5
 * секунд, поэтому здесь немного крупных плиток без разбивок.
 */
import { AlertTriangle, Building2, CalendarClock, Percent, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { occupancyTone, type computeKpi } from "@/lib/dashboard";
import { ContourBreakdown, Kpi } from "./ui";

type KpiData = ReturnType<typeof computeKpi>;

export function OverviewSummary({
  kpi,
  collectionRate,
  periodLabel,
  showHints,
}: {
  kpi: KpiData;
  collectionRate: number | null;
  periodLabel: string;
  showHints: boolean;
}) {
  const debtSub = [
    ...(kpi.aging.overdue > 0.005
      ? [{ label: "Просрочено", text: formatMoney(kpi.aging.overdue) }]
      : []),
    ...(kpi.currentMonthUnpaid > 0.005
      ? [{ label: "Не оплачено за тек. месяц", text: formatMoney(kpi.currentMonthUnpaid) }]
      : []),
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <Kpi
        icon={Wallet}
        label={`Поступления (${periodLabel.toLowerCase()})`}
        value={formatMoney(kpi.rentIncome)}
        sub={
          <ContourBreakdown
            items={[{ label: "Начислено в месяц", text: formatMoney(kpi.monthlyIncome) }]}
          />
        }
        hint={
          showHints
            ? "Сумма всех платежей за выбранный период по всему портфелю. В подстрочнике — сколько начисляется аренды в месяц по активным договорам."
            : undefined
        }
      />
      <Kpi
        icon={Percent}
        label="Собираемость месяца"
        value={collectionRate === null ? "—" : `${collectionRate.toFixed(1)}%`}
        tone={collectionRate === null ? undefined : occupancyTone(collectionRate)}
        hint={
          showHints
            ? "Какая доля начисленного за текущий месяц уже оплачена. Считается только по начислениям этого месяца — гашение старых долгов сюда не входит."
            : undefined
        }
      />
      <Kpi
        icon={AlertTriangle}
        label="Дебиторка: всего"
        value={formatMoney(kpi.aging.total)}
        tone={kpi.aging.overdue > 0 ? "danger" : "ok"}
        sub={<ContourBreakdown items={debtSub} />}
        hint={
          showHints
            ? "Неоплаченная дебиторка прошлых периодов (без начислений текущего месяца — они идут отдельной строкой). По контурам разложена в панелях ниже."
            : undefined
        }
      />
      <Kpi
        icon={Building2}
        label="Объектов"
        value={kpi.propsCount}
        hint={
          showHints
            ? "Число объектов под текущими фильтрами. Разбивка по контурам — ниже."
            : undefined
        }
      />
      <Kpi
        icon={CalendarClock}
        label="Истекают за 90 дн"
        value={kpi.expSoon}
        tone={kpi.expSoon > 0 ? "warn" : "ok"}
        hint={showHints ? "Активные договоры с датой окончания в ближайшие 90 дней." : undefined}
      />
    </div>
  );
}
