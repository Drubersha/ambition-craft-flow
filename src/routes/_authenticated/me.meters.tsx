import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Gauge, ChevronDown, Send } from "lucide-react";
import { toast } from "sonner";
import { useTenantContext } from "@/lib/tenant-context";
import { METER_TYPE_LABELS, METER_UNITS, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/me/meters")({
  component: MyMeters,
});

type MeterRow = {
  id: string;
  owner_id: string;
  serial_no: string;
  type: string;
  start_value: number;
  contract: { id: string; number: string | null; property: { name: string } | null };
};

function MyMeters() {
  const ctx = useTenantContext();
  const tenantId = ctx.status === "ready" ? ctx.tenantId : null;

  const { data: meters } = useQuery({
    queryKey: ["me-meters", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meters")
        .select(
          "id, owner_id, serial_no, type, start_value, contract:contracts!inner(id, number, tenant_id, property:properties(name))",
        )
        .eq("contract.tenant_id", tenantId!)
        .eq("active", true)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as MeterRow[];
    },
  });

  const meterIds = (meters ?? []).map((m) => m.id);
  const { data: readings } = useQuery({
    queryKey: ["me-meter-readings", meterIds.join(",")],
    enabled: meterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meter_readings")
        .select("id, meter_id, reading, read_at, source, created_at")
        .in("meter_id", meterIds)
        .order("read_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-bold">Мои счётчики</h1>
      <p className="text-sm text-muted-foreground">
        Передавайте показания в конце каждого месяца — по ним арендодатель рассчитает компенсацию за
        коммунальные услуги.
      </p>
      {!meters || meters.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Счётчиков пока нет. Если в вашем помещении есть счётчики — попросите арендодателя добавить
          их в договор.
        </Card>
      ) : (
        <div className="space-y-3">
          {meters.map((m) => (
            <MeterCard
              key={m.id}
              meter={m}
              readings={(readings ?? []).filter((r) => r.meter_id === m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MeterCard({
  meter,
  readings,
}: {
  meter: MeterRow;
  readings: { id: string; reading: number; read_at: string; source: string }[];
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const unit = METER_UNITS[meter.type] ?? "";
  const last = readings[0] ?? null;
  const lastValue = last ? Number(last.reading) : Number(meter.start_value);

  const num = Number(value);
  const invalid = value !== "" && (isNaN(num) || num < lastValue);

  const submit = useMutation({
    mutationFn: async () => {
      if (value === "" || isNaN(num)) throw new Error("Введите показание");
      if (num < lastValue)
        throw new Error(`Показание не может быть меньше предыдущего (${lastValue} ${unit})`);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("meter_readings").insert({
        owner_id: meter.owner_id,
        meter_id: meter.id,
        reading: num,
        read_at: new Date().toISOString().slice(0, 10),
        source: (u.user?.id === meter.owner_id ? "owner" : "tenant") as any,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-meter-readings"] });
      toast.success("Показание передано");
      setValue("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-primary shrink-0" />
            {METER_TYPE_LABELS[meter.type] ?? meter.type} · № {meter.serial_no}
          </div>
          <div className="text-xs text-muted-foreground">
            {meter.contract?.property?.name ?? "Помещение"}
            {meter.contract?.number ? ` · Договор № ${meter.contract.number}` : ""}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
          {lastValue} {unit}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        {last
          ? `Последнее показание: ${formatDate(last.read_at)}`
          : "Показаний ещё не было — начальное значение из договора."}
      </div>
      <form
        className="flex gap-2 items-start"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <div className="flex-1 space-y-1">
          <Label className="sr-only">Новое показание</Label>
          <Input
            type="number"
            step="0.001"
            min={lastValue}
            placeholder={`Текущее показание, ${unit}`}
            value={value}
            aria-invalid={invalid || undefined}
            onChange={(e) => setValue(e.target.value)}
          />
          {invalid && (
            <p className="text-xs text-destructive">
              Не меньше предыдущего: {lastValue} {unit}.
            </p>
          )}
        </div>
        <Button type="submit" disabled={submit.isPending || value === "" || invalid}>
          <Send className="h-4 w-4 mr-1" /> Передать
        </Button>
      </form>
      {readings.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1">
            История показаний ({readings.length})
            <ChevronDown
              className={`h-3 w-3 transition-transform ${historyOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1">
              {readings.slice(0, 12).map((r, i) => {
                const prev = readings[i + 1];
                const prevVal = prev ? Number(prev.reading) : Number(meter.start_value);
                const delta = Math.round((Number(r.reading) - prevVal) * 1000) / 1000;
                return (
                  <div key={r.id} className="flex justify-between text-xs gap-2">
                    <span className="text-muted-foreground">{formatDate(r.read_at)}</span>
                    <span className="font-medium">
                      {Number(r.reading)} {unit}
                      {delta >= 0 && (
                        <span className="text-muted-foreground font-normal"> (+{delta})</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}
