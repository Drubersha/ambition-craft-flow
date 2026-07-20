import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MeterTypeSelect } from "@/components/utilities/meter-type-select";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { METER_UNITS, formatMonthKey } from "@/lib/format";
import { analyzeLastInterval, monthlyConsumption, UTILITY_ALERT_THRESHOLD } from "@/lib/utilities";
import { groupReadingsByMeter, type Meter, type MeterReading } from "@/lib/meters";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_MONTHS = 12;

/** Вкладка «Аналитика»: динамика потребления и аномалии по арендаторам. */
export function AnalyticsTab({
  folderId,
  folders,
  meters,
  readings,
  contractById,
}: {
  folderId: string;
  folders: { id: string; name: string }[];
  meters: Meter[];
  readings: MeterReading[];
  contractById: Map<string, any>;
}) {
  const [service, setService] = useState("electricity");
  const serviceMeters = meters.filter((m) => m.type === service);
  const commonMeters = serviceMeters.filter((m) => m.folder_id);
  const tenantMeters = serviceMeters.filter((m) => !m.folder_id);
  const unit = METER_UNITS[service] ?? "";

  const readingsByMeter = useMemo(() => groupReadingsByMeter(readings), [readings]);

  const chartData = useMemo(() => {
    const sum = (list: Meter[]) => {
      const acc = new Map<string, number>();
      for (const m of list) {
        for (const row of monthlyConsumption(readingsByMeter.get(m.id) ?? [], CHART_MONTHS)) {
          acc.set(row.month, (acc.get(row.month) ?? 0) + row.consumption);
        }
      }
      return acc;
    };
    const common = sum(commonMeters);
    const tenant = sum(tenantMeters);
    return monthlyConsumption([], CHART_MONTHS).map(({ month }) => ({
      month: formatMonthKey(month),
      Общие: Math.round((common.get(month) ?? 0) * 100) / 100,
      Арендаторы: Math.round((tenant.get(month) ?? 0) * 100) / 100,
    }));
  }, [commonMeters, tenantMeters, readingsByMeter]);

  // По каждому арендаторскому счётчику: последний интервал против сезонной базы.
  const tenantRows = useMemo(
    () =>
      tenantMeters.map((m) => ({
        meter: m,
        contract: m.contract_id ? contractById.get(m.contract_id) : null,
        ...analyzeLastInterval(Number(m.start_value), readingsByMeter.get(m.id) ?? []),
      })),
    [tenantMeters, readingsByMeter, contractById],
  );

  const hasData = chartData.some((d) => d.Общие > 0 || d.Арендаторы > 0);

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <MeterTypeSelect value={service} onChange={setService} ariaLabel="Услуга" />
      </div>
      <Card className="p-4">
        <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-primary" />
          Потребление за {CHART_MONTHS} месяцев, {unit}
          {folderId ? ` · ${folders.find((f) => f.id === folderId)?.name ?? ""}` : " · все объекты"}
        </div>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Пока мало данных: добавьте счётчики и хотя бы два показания.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} width={40} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Общие" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="Арендаторы"
                  fill="hsl(var(--muted-foreground))"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {hasData && commonMeters.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Разница между «Общие» и «Арендаторы» — места общего пользования и потери.
          </p>
        )}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Арендаторы · последний интервал показаний</div>
        {tenantRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Арендаторских счётчиков этой услуги нет.</p>
        ) : (
          <div className="space-y-1">
            {tenantRows.map(({ meter, contract, current, currentDaily, baseline, anomalous }) => (
              <div key={meter.id} className="flex justify-between items-center text-xs gap-2 py-1">
                <span className="min-w-0 truncate">
                  {contract?.tenant?.name ?? "Без договора"} · № {meter.serial_no}
                </span>
                <span className="whitespace-nowrap flex items-center gap-2">
                  {current ? (
                    <>
                      <span className="font-medium">
                        {Math.round(current.consumption * 100) / 100} {unit}
                      </span>
                      <span className="text-muted-foreground">
                        ({Math.round((currentDaily ?? 0) * 100) / 100}/сут
                        {baseline != null ? `, база ${Math.round(baseline * 100) / 100}/сут` : ""})
                      </span>
                      {anomalous && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> аномалия
                        </Badge>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">нет показаний</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Аномалия — отклонение от сезонной базы (тот же период год назад, иначе среднее последних
          интервалов) более чем на {Math.round(UTILITY_ALERT_THRESHOLD * 100)}%. При вводе такого
          показания владельцу и менеджерам приходит уведомление.
        </p>
      </Card>
    </div>
  );
}
