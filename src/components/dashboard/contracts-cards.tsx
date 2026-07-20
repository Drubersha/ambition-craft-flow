/** Карточки договорной базы: истекающие договоры и история индексаций ставок. */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { daysUntil, formatDate, formatNum, monthlyFromRate } from "@/lib/format";
import type { Contract } from "@/lib/dashboard";
import { EmptyText } from "./ui";

export function ExpiringLists({ contracts }: { contracts: Contract[] }) {
  const buckets = useMemo(() => {
    const b: { [k: string]: Contract[] } = { "0-30": [], "31-60": [], "61-90": [] };
    contracts
      .filter((c) => c.status === "active")
      .forEach((c) => {
        const d = daysUntil(c.end_date);
        if (d === null) return;
        if (d >= 0 && d <= 30) b["0-30"].push(c);
        else if (d <= 60) b["31-60"].push(c);
        else if (d <= 90) b["61-90"].push(c);
      });
    return b;
  }, [contracts]);
  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-base">Истекающие договоры</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["0-30", "31-60", "61-90"] as const).map((k) => (
          <div key={k}>
            <div className="text-xs font-semibold mb-1">
              <span
                className={
                  k === "0-30" ? "text-destructive" : k === "31-60" ? "text-warning" : "text-info"
                }
              >
                {k === "0-30" ? "0–30" : k === "31-60" ? "31–60" : "61–90"} дней
              </span>{" "}
              <span className="text-muted-foreground">({buckets[k].length})</span>
            </div>
            {buckets[k].length === 0 ? (
              <div className="text-xs text-muted-foreground">—</div>
            ) : (
              <ul className="space-y-1">
                {buckets[k].slice(0, 5).map((c) => (
                  <li key={c.id} className="text-sm flex items-center justify-between gap-2">
                    <Link
                      to="/contracts/$id"
                      params={{ id: c.id }}
                      className="hover:underline truncate"
                    >
                      № {c.number} — {c.tenant?.name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(c.end_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function RateHistoryTable({ contracts }: { contracts: Contract[] }) {
  const rows = useMemo(() => {
    const byProp = new Map<string, Contract[]>();
    contracts.forEach((c) => {
      const arr = byProp.get(c.property_id) || [];
      arr.push(c);
      byProp.set(c.property_id, arr);
    });
    const out: {
      property: string;
      date: string;
      oldRate: number;
      newRate: number;
      delta: number;
    }[] = [];
    byProp.forEach((list) => {
      const sorted = [...list].sort((a, b) => a.start_date.localeCompare(b.start_date));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        const o = monthlyFromRate(Number(prev.rate), prev.payment_period);
        const n = monthlyFromRate(Number(cur.rate), cur.payment_period);
        if (o === 0 && n === 0) continue;
        out.push({
          property: cur.property?.name || "—",
          date: cur.start_date,
          oldRate: o,
          newRate: n,
          delta: o > 0 ? ((n - o) / o) * 100 : 0,
        });
      }
    });
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [contracts]);
  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-base">История индексаций ставок</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {rows.length === 0 ? (
          <EmptyText text="Недостаточно данных — нужно ≥2 договора по объекту." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-2">Дата</th>
                  <th className="p-2">Объект</th>
                  <th className="p-2 text-right">Старая</th>
                  <th className="p-2 text-right">Новая</th>
                  <th className="p-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{formatDate(r.date)}</td>
                    <td className="p-2 truncate max-w-[200px]">{r.property}</td>
                    <td className="p-2 text-right tabular-nums">{formatNum(r.oldRate)}</td>
                    <td className="p-2 text-right tabular-nums">{formatNum(r.newRate)}</td>
                    <td
                      className={`p-2 text-right tabular-nums ${r.delta >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {r.delta >= 0 ? "+" : ""}
                      {r.delta.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
