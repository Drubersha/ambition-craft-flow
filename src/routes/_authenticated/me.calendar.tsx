import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDemoIdentity } from "@/lib/demo-identity";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CHARGE_STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/me/calendar")({
  component: MyCalendar,
});

function MyCalendar() {
  const { tenantId } = useDemoIdentity();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const { data } = useQuery({
    queryKey: ["me-calendar", tenantId, monthStart.toISOString()],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select("id, due_date, total, paid_total, status, contract:contracts!inner(number, currency, tenant_id)")
        .eq("contract.tenant_id", tenantId!)
        .gte("due_date", monthStart.toISOString().slice(0, 10))
        .lte("due_date", monthEnd.toISOString().slice(0, 10))
        .order("due_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const c of data ?? []) {
      if (!c.due_date) continue;
      const key = c.due_date as string;
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return m;
  }, [data]);

  const [selected, setSelected] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Build a 6x7 grid starting on Monday
  const firstDow = (monthStart.getDay() + 6) % 7;
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(monthStart);
    d.setDate(1 - firstDow + i);
    cells.push({ date: d, inMonth: d.getMonth() === monthStart.getMonth() });
  }

  const selectedItems = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">Календарь оплат</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium min-w-[140px] text-center">
            {monthStart.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Card className="p-2">
        <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground uppercase mb-1">
          {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d) => <div key={d} className="text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map(({ date, inMonth }, i) => {
            const key = date.toISOString().slice(0, 10);
            const items = byDay.get(key) ?? [];
            const isToday = key === today;
            const hasOverdue = items.some((c) => c.status === "overdue");
            const hasPaid = items.length > 0 && items.every((c) => c.status === "paid");
            return (
              <button
                key={i}
                onClick={() => items.length && setSelected(key)}
                className={cn(
                  "min-h-14 rounded p-1 text-left text-xs border transition-colors",
                  inMonth ? "bg-background" : "bg-muted/30 text-muted-foreground",
                  isToday && "border-primary",
                  items.length && "hover:bg-muted cursor-pointer",
                  selected === key && "ring-2 ring-primary",
                )}
              >
                <div className="font-medium">{date.getDate()}</div>
                {items.length > 0 && (
                  <div className={cn(
                    "mt-1 inline-block h-2 w-2 rounded-full",
                    hasOverdue ? "bg-destructive" : hasPaid ? "bg-green-500" : "bg-primary",
                  )} />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {selected && (
        <Card className="p-3 space-y-2">
          <div className="text-sm font-medium">Платежи на {formatDate(selected)}</div>
          {selectedItems.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between gap-3 text-sm border-b last:border-0 py-1">
              <div>
                <div>{c.contract?.number ? `Договор № ${c.contract.number}` : "Договор"}</div>
                <div className="text-xs text-muted-foreground">
                  Оплачено {formatMoney(c.paid_total, c.contract?.currency)} из {formatMoney(c.total, c.contract?.currency)}
                </div>
              </div>
              <Badge variant={c.status === "paid" ? "default" : c.status === "overdue" ? "destructive" : "secondary"}>
                {CHARGE_STATUS_LABELS[c.status]}
              </Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}