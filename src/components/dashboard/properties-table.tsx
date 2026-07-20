/** Сортируемая таблица объектов с занятостью и доходом по активным договорам. */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  formatMoney,
  formatNum,
  monthlyFromRate,
} from "@/lib/format";
import { occupancyTone, toneClass, type Contract, type Property } from "@/lib/dashboard";

export function PropertiesTable({
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
                (s, c) =>
                  s + monthlyFromRate(Number(c.rate), c.payment_period) * Number(c.area || 0),
                0,
              ) / leased
            : Number(p.base_rate || 0);
        // Статус, вычисленный по фактическим активным договорам аренды,
        // имеет приоритет над сохранённым в БД (он может быть устаревшим).
        let derivedStatus = p.status;
        if (occ >= 99.5) derivedStatus = "occupied";
        else if (occ > 0) derivedStatus = "partial";
        else if (
          p.status !== "ahch" &&
          p.status !== "partial_ahch" &&
          p.status !== "maintenance" &&
          p.status !== "archived"
        ) {
          derivedStatus = "free";
        }
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          area: p.area_total,
          occ,
          rate: avgRate,
          income: monthlyIncome,
          status: derivedStatus,
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
