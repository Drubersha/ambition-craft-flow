/**
 * Панель одного контура: слева снимок «сейчас» (площадь, занятость, ставка,
 * деньги, долг), справа — три мини-графика за год (поступления, занятость,
 * начислено vs оплачено). Всё по одному контуру: метры/места контура однородны,
 * поэтому цифры складываются осмысленно.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMonthKey, formatNum } from "@/lib/format";
import {
  occupancyTone,
  toneClass,
  type ContourArea,
  type ContourIncome,
  type ContourMonthPoint,
  type ContourRate,
} from "@/lib/dashboard";
import { EmptyText } from "./ui";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground truncate">{label}</div>
      <div className={`text-sm font-semibold break-words ${toneClass(tone)}`}>{value}</div>
    </div>
  );
}

function MiniChart({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactElement;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground mb-1">{title}</div>
      <div style={{ width: "100%", height: 150 }}>
        {empty ? (
          <div className="h-full flex items-center justify-center">
            <EmptyText text="Нет данных за год" />
          </div>
        ) : (
          <ResponsiveContainer>{children}</ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function ContourPanel({
  area,
  rate,
  income,
  debt,
  series,
  periodLabel,
}: {
  area: ContourArea;
  rate?: ContourRate;
  income?: ContourIncome;
  debt: number;
  series: ContourMonthPoint[];
  periodLabel: string;
}) {
  const unit = area.unit;
  const data = series.map((p) => ({ ...p, label: formatMonthKey(p.month, "2-digit") }));
  const hasOccupancy = series.some((p) => p.occupancy !== null);
  const hasBilling = series.some((p) => p.billed > 0 || p.collected > 0);
  const hasIncome = series.some((p) => p.income > 0);
  const money = (v: number | string) => formatMoney(Number(v));

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{area.label}</h3>
          {area.occupancy !== null && (
            <Badge
              variant="secondary"
              className={`${toneClass(occupancyTone(area.occupancy))} bg-transparent border`}
            >
              занятость {area.occupancy.toFixed(0)}%
            </Badge>
          )}
        </div>

        {/* Снимок «сейчас» */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2">
          <Stat
            label={`Площадь · ${area.properties} об.`}
            value={`${formatNum(area.total)} ${unit}`}
          />
          <Stat
            label="Сдано"
            value={`${formatNum(area.leased)} ${unit}`}
            tone={area.occupancy === null ? undefined : occupancyTone(area.occupancy)}
          />
          <Stat label="Свободно" value={`${formatNum(area.free)} ${unit}`} />
          {area.ahch > 0 && <Stat label="АХЧ" value={`${formatNum(area.ahch)} ${unit}`} />}
          {rate && <Stat label="Ставка" value={`${formatNum(rate.rate)} ${rate.unit}`} />}
          <Stat
            label={`Поступления (${periodLabel.toLowerCase()})`}
            value={formatMoney(income?.rentIncome ?? 0)}
          />
          <Stat label="Начислено / мес" value={formatMoney(income?.monthlyIncome ?? 0)} />
          <Stat label="Долг" value={formatMoney(debt)} tone={debt > 0.005 ? "danger" : "ok"} />
        </div>

        {/* Графики за год */}
        <div className="grid md:grid-cols-3 gap-3 pt-1">
          <MiniChart title="Поступления, ₽" empty={!hasIncome}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10 }}
                width={48}
                tickFormatter={(v: number) => formatNum(v)}
              />
              <RTooltip formatter={money} />
              <Line
                type="monotone"
                dataKey="income"
                name="Поступления"
                stroke="var(--info)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </MiniChart>

          <MiniChart title="Занятость, %" empty={!hasOccupancy}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={32} domain={[0, 100]} unit="%" />
              <RTooltip formatter={(v: number | string) => `${Number(v).toFixed(1)}%`} />
              <Line
                type="monotone"
                dataKey="occupancy"
                name="Занятость"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </MiniChart>

          <MiniChart title="Начислено vs оплачено, ₽" empty={!hasBilling}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10 }}
                width={48}
                tickFormatter={(v: number) => formatNum(v)}
              />
              <RTooltip formatter={money} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="billed"
                name="Начислено"
                stroke="var(--warning)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="collected"
                name="Оплачено"
                stroke="var(--success)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </MiniChart>
        </div>
      </CardContent>
    </Card>
  );
}
