import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { Gauge, Plus, Trash2, Receipt, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  METER_TYPE_LABELS,
  METER_UNITS,
  UTILITY_PERIOD_STATUS_LABELS,
  formatDate,
  formatMoney,
} from "@/lib/format";
import {
  allocateUtilityCosts,
  consumptionForPeriod,
  daysOverlap,
  dailyRate,
  formatMonthKey,
  isAnomalous,
  monthlyConsumption,
  seasonalBaselineDaily,
  type AllocationResult,
  type ConsumptionInterval,
  type ReadingPoint,
} from "@/lib/utilities";
import { getPeriodFor } from "@/lib/budget";
import { useEffectiveOwnerId } from "@/lib/manager-context";
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

export const Route = createFileRoute("/_authenticated/utilities/")({
  component: UtilitiesPage,
});

type Meter = {
  id: string;
  owner_id: string;
  serial_no: string;
  type: string;
  property_id: string | null;
  folder_id: string | null;
  contract_id: string | null;
  start_value: number;
  active: boolean;
};

type Reading = {
  id: string;
  meter_id: string;
  reading: number;
  read_at: string;
  source: string;
};

function UtilitiesPage() {
  const [folderId, setFolderId] = useState<string>("");

  const { data: folders } = useQuery({
    queryKey: ["folders-list"],
    queryFn: async () =>
      (await supabase.from("folders").select("id,name").order("name")).data ?? [],
  });
  const { data: properties } = useQuery({
    queryKey: ["properties-list-utilities"],
    queryFn: async () =>
      (await supabase.from("properties").select("id,name,folder_id").order("name")).data ?? [],
  });
  const { data: contracts } = useQuery({
    queryKey: ["contracts-list-utilities"],
    queryFn: async () =>
      (
        await supabase
          .from("contracts")
          .select("id,number,property_id,area,start_date,end_date,status,tenant:tenants(id,name)")
          .order("start_date", { ascending: false })
      ).data ?? [],
  });
  const { data: meters } = useQuery({
    queryKey: ["meters"],
    queryFn: async () =>
      ((await supabase.from("meters").select("*").eq("active", true).order("created_at")).data ??
        []) as Meter[],
  });
  const meterIds = (meters ?? []).map((m) => m.id);
  const { data: readings } = useQuery({
    queryKey: ["meter-readings", meterIds.join(",")],
    enabled: meterIds.length > 0,
    queryFn: async () =>
      ((
        await supabase
          .from("meter_readings")
          .select("id, meter_id, reading, read_at, source")
          .in("meter_id", meterIds)
          .order("read_at")
      ).data ?? []) as Reading[],
  });

  const propertyById = useMemo(
    () => new Map((properties ?? []).map((p) => [p.id, p])),
    [properties],
  );
  const contractById = useMemo(() => new Map((contracts ?? []).map((c) => [c.id, c])), [contracts]);

  // Фильтр по папке: счётчик попадает в папку напрямую (общий) или через объект.
  const visibleMeters = (meters ?? []).filter((m) => {
    if (!folderId) return true;
    if (m.folder_id) return m.folder_id === folderId;
    const p = m.property_id ? propertyById.get(m.property_id) : null;
    return p?.folder_id === folderId;
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Коммуналка"
        description="Счётчики, показания и компенсация коммунальных услуг с арендаторов"
      />
      <div className="max-w-xs">
        <Select value={folderId || "all"} onValueChange={(v) => setFolderId(v === "all" ? "" : v)}>
          <SelectTrigger aria-label="Фильтр по папке">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все папки</SelectItem>
            {folders?.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Tabs defaultValue="meters">
        <TabsList>
          <TabsTrigger value="meters">Счётчики</TabsTrigger>
          <TabsTrigger value="periods">Компенсация</TabsTrigger>
          <TabsTrigger value="analytics">Аналитика</TabsTrigger>
        </TabsList>
        <TabsContent value="meters" className="space-y-3 pt-3">
          <MetersTab
            meters={visibleMeters}
            readings={readings ?? []}
            folders={folders ?? []}
            properties={properties ?? []}
            contracts={contracts ?? []}
            propertyById={propertyById}
            contractById={contractById}
          />
        </TabsContent>
        <TabsContent value="periods" className="space-y-3 pt-3">
          <PeriodsTab
            folderId={folderId}
            folders={folders ?? []}
            meters={meters ?? []}
            readings={readings ?? []}
            properties={properties ?? []}
            contracts={contracts ?? []}
            propertyById={propertyById}
          />
        </TabsContent>
        <TabsContent value="analytics" className="space-y-3 pt-3">
          <AnalyticsTab
            folderId={folderId}
            folders={folders ?? []}
            meters={visibleMeters}
            readings={readings ?? []}
            contractById={contractById}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== Счётчики ============================== */

function MetersTab({
  meters,
  readings,
  folders,
  properties,
  contracts,
  propertyById,
  contractById,
}: {
  meters: Meter[];
  readings: Reading[];
  folders: { id: string; name: string }[];
  properties: { id: string; name: string; folder_id: string | null }[];
  contracts: any[];
  propertyById: Map<string, any>;
  contractById: Map<string, any>;
}) {
  const lastByMeter = useMemo(() => {
    const map = new Map<string, Reading>();
    for (const r of readings) {
      const cur = map.get(r.meter_id);
      if (!cur || r.read_at >= cur.read_at) map.set(r.meter_id, r);
    }
    return map;
  }, [readings]);

  const qc = useQueryClient();
  const delMeter = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meters"] });
      toast.success("Счётчик удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const placeLabel = (m: Meter) => {
    if (m.folder_id) {
      const f = folders.find((x) => x.id === m.folder_id);
      return `Общий · ${f?.name ?? "папка"}`;
    }
    const p = m.property_id ? propertyById.get(m.property_id) : null;
    return p?.name ?? "—";
  };
  const tenantLabel = (m: Meter) => {
    const c = m.contract_id ? contractById.get(m.contract_id) : null;
    if (!c) return "—";
    return c.tenant?.name ?? (c.number ? `Договор № ${c.number}` : "—");
  };

  return (
    <>
      <div className="flex justify-end">
        <AddMeterDialog folders={folders} properties={properties} contracts={contracts} />
      </div>
      {meters.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Счётчиков нет. Добавьте счётчики арендаторов в договорах, а общие (домовые) — кнопкой
          «Добавить счётчик».
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Тип</TableHead>
                <TableHead>Номер</TableHead>
                <TableHead>Размещение</TableHead>
                <TableHead>Арендатор</TableHead>
                <TableHead className="text-right">Последнее показание</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meters.map((m) => {
                const last = lastByMeter.get(m.id);
                const unit = METER_UNITS[m.type] ?? "";
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <Gauge className="h-4 w-4 text-primary shrink-0" />
                        {METER_TYPE_LABELS[m.type] ?? m.type}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{m.serial_no}</TableCell>
                    <TableCell>{placeLabel(m)}</TableCell>
                    <TableCell>{tenantLabel(m)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {last ? (
                        <>
                          {Number(last.reading)} {unit}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            · {formatDate(last.read_at)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          нач. {Number(m.start_value)} {unit}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <AddReadingDialog meter={m} last={last ?? null} />
                        <ConfirmButton
                          variant="ghost"
                          size="icon"
                          aria-label="Удалить счётчик"
                          destructive
                          title="Удалить счётчик?"
                          description={`Счётчик № ${m.serial_no} и все его показания будут удалены.`}
                          confirmText="Удалить"
                          onConfirm={() => delMeter.mutate(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </ConfirmButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function AddMeterDialog({
  folders,
  properties,
  contracts,
}: {
  folders: { id: string; name: string }[];
  properties: { id: string; name: string }[];
  contracts: any[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("electricity");
  const [serial, setSerial] = useState("");
  const [scope, setScope] = useState<"folder" | "property">("folder");
  const [placeId, setPlaceId] = useState("");
  const [contractId, setContractId] = useState("");
  const [startValue, setStartValue] = useState("");
  const { ownerId } = useEffectiveOwnerId();
  const qc = useQueryClient();

  const propertyContracts = contracts.filter((c) => c.property_id === placeId);

  const mut = useMutation({
    mutationFn: async () => {
      if (!ownerId) throw new Error("Не удалось определить арендодателя");
      if (!serial.trim()) throw new Error("Укажите номер счётчика");
      if (!placeId) throw new Error("Выберите папку или объект");
      const sv = startValue ? Number(startValue) : 0;
      if (isNaN(sv) || sv < 0) throw new Error("Начальное показание не может быть отрицательным");
      const { error } = await supabase.from("meters").insert({
        owner_id: ownerId,
        serial_no: serial.trim(),
        type: type as any,
        folder_id: scope === "folder" ? placeId : null,
        property_id: scope === "property" ? placeId : null,
        contract_id: scope === "property" && contractId ? contractId : null,
        start_value: sv,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meters"] });
      toast.success("Счётчик добавлен");
      setOpen(false);
      setSerial("");
      setStartValue("");
      setContractId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Добавить счётчик
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый счётчик</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Тип</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METER_TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Номер счётчика</Label>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Где стоит</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope(v as any);
                setPlaceId("");
                setContractId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="folder">Общий на группу объектов (папку)</SelectItem>
                <SelectItem value="property">В помещении (объекте)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{scope === "folder" ? "Папка" : "Объект"}</Label>
            <Select value={placeId} onValueChange={setPlaceId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите" />
              </SelectTrigger>
              <SelectContent>
                {(scope === "folder" ? folders : properties).map((x: any) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scope === "property" && propertyContracts.length > 0 && (
            <div className="space-y-1">
              <Label>Договор (для подачи показаний арендатором)</Label>
              <Select
                value={contractId || "none"}
                onValueChange={(v) => setContractId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без договора</SelectItem>
                  {propertyContracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.tenant?.name ?? "—"} {c.number ? `(№ ${c.number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Начальное показание, {METER_UNITS[type] ?? ""}</Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              placeholder="0 — новый, либо текущее значение б/у счётчика"
              value={startValue}
              onChange={(e) => setStartValue(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddReadingDialog({ meter, last }: { meter: Meter; last: Reading | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();
  const unit = METER_UNITS[meter.type] ?? "";
  const lastValue = last ? Number(last.reading) : Number(meter.start_value);

  const mut = useMutation({
    mutationFn: async () => {
      const num = Number(value);
      if (value === "" || isNaN(num)) throw new Error("Введите показание");
      if (num < lastValue)
        throw new Error(`Показание не может быть меньше предыдущего (${lastValue} ${unit})`);
      if (!date) throw new Error("Укажите дату");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("meter_readings").insert({
        owner_id: meter.owner_id,
        meter_id: meter.id,
        reading: num,
        read_at: date,
        source: "owner" as any,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meter-readings"] });
      toast.success("Показание сохранено");
      setOpen(false);
      setValue("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Показание
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Показание · {METER_TYPE_LABELS[meter.type]} № {meter.serial_no}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Предыдущее: {lastValue} {unit}
            {last ? ` (${formatDate(last.read_at)})` : " — начальное значение"}
          </p>
          <div className="space-y-1">
            <Label>Показание, {unit}</Label>
            <Input
              type="number"
              step="0.001"
              min={lastValue}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Дата снятия</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== Компенсация ============================== */

function PeriodsTab({
  folderId,
  folders,
  meters,
  readings,
  properties,
  contracts,
  propertyById,
}: {
  folderId: string;
  folders: { id: string; name: string }[];
  meters: Meter[];
  readings: Reading[];
  properties: { id: string; name: string; folder_id: string | null }[];
  contracts: any[];
  propertyById: Map<string, any>;
}) {
  const { data: periods } = useQuery({
    queryKey: ["utility-periods"],
    queryFn: async () =>
      (
        await supabase
          .from("utility_periods")
          .select("*, folder:folders(name)")
          .order("period_start", { ascending: false })
      ).data ?? [],
  });
  const qc = useQueryClient();
  const delPeriod = useMutation({
    mutationFn: async (p: any) => {
      // Удаляем расход бюджета, только период и распределения; начисления
      // остаются — их можно удалить на странице начисления.
      if (p.expense_id) {
        await supabase.from("budget_expenses").delete().eq("id", p.expense_id);
      }
      const { error } = await supabase.from("utility_periods").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["utility-periods"] });
      toast.success("Период удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const visible = (periods ?? []).filter((p: any) => !folderId || p.folder_id === folderId);

  return (
    <>
      <div className="flex justify-end">
        <ClosePeriodDialog
          folders={folders}
          defaultFolderId={folderId}
          meters={meters}
          readings={readings}
          properties={properties}
          contracts={contracts}
          propertyById={propertyById}
        />
      </div>
      {visible.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Закрытых периодов нет. Нажмите «Распределить расходы», чтобы разнести общий счёт за
          коммуналку по арендаторам и создать начисления.
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((p: any) => (
            <PeriodCard key={p.id} period={p} onDelete={() => delPeriod.mutate(p)} />
          ))}
        </div>
      )}
    </>
  );
}

function PeriodCard({ period, onDelete }: { period: any; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: allocations } = useQuery({
    queryKey: ["utility-allocations", period.id],
    enabled: open,
    queryFn: async () =>
      (
        await supabase
          .from("utility_allocations")
          .select("*, contract:contracts(number, tenant:tenants(name))")
          .eq("period_id", period.id)
          .order("amount", { ascending: false })
      ).data ?? [],
  });
  const unit = METER_UNITS[period.service] ?? "";
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 text-left flex-1"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="font-medium text-sm">
            {METER_TYPE_LABELS[period.service] ?? period.service} ·{" "}
            {formatDate(period.period_start)} — {formatDate(period.period_end)}
          </div>
          <div className="text-xs text-muted-foreground">
            {period.folder?.name ?? "Папка"} · Счёт:{" "}
            {formatMoney(period.total_amount, period.currency)}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={period.status === "allocated" ? "default" : "secondary"}>
            {UTILITY_PERIOD_STATUS_LABELS[period.status] ?? period.status}
          </Badge>
          <ConfirmButton
            variant="ghost"
            size="icon"
            aria-label="Удалить период"
            destructive
            title="Удалить период?"
            description="Распределение и связанный расход бюджета будут удалены. Созданные начисления останутся."
            confirmText="Удалить"
            onConfirm={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </ConfirmButton>
        </div>
      </div>
      {open && (
        <div className="space-y-1 border-t pt-2">
          {!allocations ? (
            <p className="text-xs text-muted-foreground">Загрузка…</p>
          ) : allocations.length === 0 ? (
            <p className="text-xs text-muted-foreground">Распределения нет.</p>
          ) : (
            allocations.map((a: any) => (
              <div key={a.id} className="flex justify-between text-xs gap-2">
                <span className="min-w-0 truncate">
                  {a.contract?.tenant?.name ?? "—"}
                  {a.contract?.number ? ` (№ ${a.contract.number})` : ""}
                  {a.consumption != null ? ` · ${Number(a.consumption)} ${unit}` : ""}
                  {a.charge_id ? "" : " · начисление удалено?"}
                </span>
                <span className="font-medium whitespace-nowrap">
                  {formatMoney(a.amount, period.currency)}
                  {a.charge_id && (
                    <Link
                      to="/charges/$id"
                      params={{ id: a.charge_id }}
                      className="ml-2 underline text-muted-foreground"
                    >
                      начисление
                    </Link>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

function lastDayOfPrevMonth(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

function ClosePeriodDialog({
  folders,
  defaultFolderId,
  meters,
  readings,
  properties,
  contracts,
  propertyById,
}: {
  folders: { id: string; name: string }[];
  defaultFolderId: string;
  meters: Meter[];
  readings: Reading[];
  properties: { id: string; name: string; folder_id: string | null }[];
  contracts: any[];
  propertyById: Map<string, any>;
}) {
  const [open, setOpen] = useState(false);
  const prev = lastDayOfPrevMonth();
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [service, setService] = useState("electricity");
  const [periodStart, setPeriodStart] = useState(prev.start);
  const [periodEnd, setPeriodEnd] = useState(prev.end);
  const [total, setTotal] = useState("");
  const [mode, setMode] = useState<"meters_then_area" | "by_area">("meters_then_area");
  const qc = useQueryClient();
  const { ownerId } = useEffectiveOwnerId();

  const readingsByMeter = useMemo(() => {
    const map = new Map<string, ReadingPoint[]>();
    for (const r of readings) {
      const arr = map.get(r.meter_id) ?? [];
      arr.push({ reading: Number(r.reading), read_at: r.read_at });
      map.set(r.meter_id, arr);
    }
    return map;
  }, [readings]);

  // Договоры папки, пересекающиеся с периодом.
  const folderContracts = useMemo(() => {
    if (!folderId) return [];
    return contracts.filter((c) => {
      const p = propertyById.get(c.property_id);
      if (p?.folder_id !== folderId) return false;
      if (c.status !== "active" && c.status !== "finished") return false;
      return daysOverlap(c.start_date, c.end_date, periodStart, periodEnd) > 0;
    });
  }, [contracts, folderId, periodStart, periodEnd, propertyById]);

  const preview = useMemo(() => {
    if (!folderId || folderContracts.length === 0) return null;
    const totalNum = Number(total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) return null;

    const serviceMeters = meters.filter((m) => m.type === service);
    const commonMeters = serviceMeters.filter((m) => m.folder_id === folderId);
    const commonConsumption = commonMeters.reduce((s, m) => {
      const c = consumptionForPeriod(
        Number(m.start_value),
        readingsByMeter.get(m.id) ?? [],
        periodStart,
        periodEnd,
      );
      return s + (c ?? 0);
    }, 0);

    const entries = folderContracts.map((c) => {
      const contractMeters = serviceMeters.filter((m) => m.contract_id === c.id);
      let consumption: number | null = null;
      let meterId: string | null = null;
      for (const m of contractMeters) {
        const v = consumptionForPeriod(
          Number(m.start_value),
          readingsByMeter.get(m.id) ?? [],
          periodStart,
          periodEnd,
        );
        if (v != null) {
          consumption = (consumption ?? 0) + v;
          meterId = m.id;
        }
      }
      return {
        contractId: c.id,
        meterId,
        consumption,
        area: Number(c.area) || 0,
        days: daysOverlap(c.start_date, c.end_date, periodStart, periodEnd),
        metersCount: contractMeters.length,
      };
    });

    const allocations = allocateUtilityCosts({
      totalAmount: totalNum,
      entries,
      commonConsumption: commonConsumption > 0 ? commonConsumption : null,
      mode,
    });
    return { allocations, entries, commonConsumption };
  }, [
    folderId,
    folderContracts,
    total,
    meters,
    service,
    readingsByMeter,
    periodStart,
    periodEnd,
    mode,
  ]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!ownerId) throw new Error("Не удалось определить арендодателя");
      if (!preview) throw new Error("Заполните папку, период и сумму счёта");
      const totalNum = Number(total);

      // 1. Период.
      const { data: period, error: pErr } = await supabase
        .from("utility_periods")
        .insert({
          owner_id: ownerId,
          folder_id: folderId,
          service: service as any,
          period_start: periodStart,
          period_end: periodEnd,
          total_amount: totalNum,
          status: "allocated" as any,
        })
        .select()
        .single();
      if (pErr) throw pErr;

      // 2. Начисление + распределение по каждому договору.
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10);
      const due = dueDate.toISOString().slice(0, 10);
      for (const a of preview.allocations) {
        if (a.amount <= 0) continue;
        const { data: charge, error: chErr } = await supabase
          .from("charges")
          .insert({
            owner_id: ownerId,
            contract_id: a.contractId,
            period_start: periodStart,
            period_end: periodEnd,
            due_date: due,
            total: a.amount,
            notes: `Коммунальные услуги: ${METER_TYPE_LABELS[service] ?? service}`,
          })
          .select()
          .single();
        if (chErr) throw chErr;
        const { error: ciErr } = await supabase.from("charge_items").insert({
          owner_id: ownerId,
          charge_id: charge.id,
          kind: "utilities",
          description: `${METER_TYPE_LABELS[service] ?? service}${
            a.consumption != null ? `, ${a.consumption} ${METER_UNITS[service] ?? ""}` : ""
          }`,
          amount: a.amount,
        });
        if (ciErr) throw ciErr;
        const { error: alErr } = await supabase.from("utility_allocations").insert({
          owner_id: ownerId,
          period_id: period.id,
          contract_id: a.contractId,
          meter_id: a.meterId,
          charge_id: charge.id,
          consumption: a.consumption,
          amount: a.amount,
          method: a.method,
        });
        if (alErr) throw alErr;
      }

      // 3. Затраты: расход в бюджете папки (категория «Коммунальные»).
      const { data: plan } = await supabase
        .from("budget_plans")
        .select("id, reset_day")
        .eq("folder_id", folderId)
        .maybeSingle();
      if (plan) {
        let { data: cat } = await supabase
          .from("budget_categories")
          .select("id")
          .eq("plan_id", plan.id)
          .ilike("name", "Коммунальные%")
          .limit(1)
          .maybeSingle();
        if (!cat) {
          const { data: created, error: catErr } = await supabase
            .from("budget_categories")
            .insert({ owner_id: ownerId, plan_id: plan.id, name: "Коммунальные", limit_amount: 0 })
            .select()
            .single();
          if (catErr) throw catErr;
          cat = created;
        }
        const bp = getPeriodFor(plan.reset_day, new Date(periodEnd));
        const { data: expense, error: exErr } = await supabase
          .from("budget_expenses")
          .insert({
            owner_id: ownerId,
            plan_id: plan.id,
            category_id: cat!.id,
            amount: totalNum,
            spent_at: periodEnd,
            period_start: bp.start,
            period_end: bp.end,
            note: `Коммуналка: ${METER_TYPE_LABELS[service] ?? service} ${formatDate(periodStart)} — ${formatDate(periodEnd)}`,
          })
          .select()
          .single();
        if (exErr) throw exErr;
        await supabase
          .from("utility_periods")
          .update({ expense_id: expense.id })
          .eq("id", period.id);
      }
      return preview.allocations.filter((a) => a.amount > 0).length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["utility-periods"] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      toast.success(`Период закрыт, создано начислений: ${n}`);
      setOpen(false);
      setTotal("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unit = METER_UNITS[service] ?? "";
  const contractLabel = (id: string) => {
    const c = contracts.find((x) => x.id === id);
    return c ? `${c.tenant?.name ?? "—"}${c.number ? ` (№ ${c.number})` : ""}` : "—";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Receipt className="h-4 w-4 mr-1" /> Распределить расходы
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Компенсация коммунальных услуг</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Папка (группа объектов)</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Услуга</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METER_TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Период с</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Период по</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Общий счёт за услугу, ₽</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Сумма из счёта поставщика"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Способ распределения</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meters_then_area">По счётчикам, остаток по площади</SelectItem>
                  <SelectItem value="by_area">Только по площади</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {folderId && folderContracts.length === 0 && (
            <p className="text-sm text-destructive">
              В папке нет договоров, пересекающихся с периодом.
            </p>
          )}
          {preview && (
            <div className="space-y-2 border rounded-lg p-3">
              <div className="text-sm font-medium">Предпросмотр распределения</div>
              {preview.commonConsumption > 0 && (
                <p className="text-xs text-muted-foreground">
                  Общие счётчики за период: {Math.round(preview.commonConsumption * 1000) / 1000}{" "}
                  {unit} → тариф {formatMoney(Number(total) / preview.commonConsumption)}/{unit}
                </p>
              )}
              <div className="space-y-1">
                {preview.allocations.map((a: AllocationResult) => (
                  <div key={a.contractId} className="flex justify-between text-xs gap-2">
                    <span className="min-w-0 truncate">
                      {contractLabel(a.contractId)}
                      {a.consumption != null
                        ? ` · ${a.consumption} ${unit}`
                        : " · без счётчика (по площади)"}
                    </span>
                    <span className="font-medium whitespace-nowrap">{formatMoney(a.amount)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Итого: {formatMoney(preview.allocations.reduce((s, a) => s + a.amount, 0))} из{" "}
                {formatMoney(Number(total) || 0)}. Каждому арендатору будет создано начисление со
                сроком оплаты через 10 дней; общая сумма попадёт в бюджет папки (категория
                «Коммунальные»).
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !preview}>
            {mut.isPending ? "Создание..." : "Закрыть период и начислить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== Аналитика ============================== */

function AnalyticsTab({
  folderId,
  folders,
  meters,
  readings,
  contractById,
}: {
  folderId: string;
  folders: { id: string; name: string }[];
  meters: Meter[];
  readings: Reading[];
  contractById: Map<string, any>;
}) {
  const [service, setService] = useState("electricity");
  const serviceMeters = meters.filter((m) => m.type === service);
  const commonMeters = serviceMeters.filter((m) => m.folder_id);
  const tenantMeters = serviceMeters.filter((m) => !m.folder_id);
  const unit = METER_UNITS[service] ?? "";

  const readingsByMeter = useMemo(() => {
    const map = new Map<string, ReadingPoint[]>();
    for (const r of readings) {
      const arr = map.get(r.meter_id) ?? [];
      arr.push({ reading: Number(r.reading), read_at: r.read_at });
      map.set(r.meter_id, arr);
    }
    return map;
  }, [readings]);

  const chartData = useMemo(() => {
    const months = 12;
    const sum = (list: Meter[]) => {
      const acc = new Map<string, number>();
      for (const m of list) {
        for (const row of monthlyConsumption(readingsByMeter.get(m.id) ?? [], months)) {
          acc.set(row.month, (acc.get(row.month) ?? 0) + row.consumption);
        }
      }
      return acc;
    };
    const common = sum(commonMeters);
    const tenant = sum(tenantMeters);
    const keys = monthlyConsumption([], months).map((r) => r.month);
    return keys.map((month) => ({
      month: formatMonthKey(month),
      Общие: Math.round((common.get(month) ?? 0) * 100) / 100,
      Арендаторы: Math.round((tenant.get(month) ?? 0) * 100) / 100,
    }));
  }, [commonMeters, tenantMeters, readingsByMeter]);

  // По каждому арендаторскому счётчику: последний интервал против сезонной базы.
  const tenantRows = useMemo(() => {
    return tenantMeters.map((m) => {
      const pts = [...(readingsByMeter.get(m.id) ?? [])].sort((a, b) =>
        a.read_at.localeCompare(b.read_at),
      );
      const intervals: ConsumptionInterval[] = [];
      let prevVal = Number(m.start_value);
      let prevDate: string | null = null;
      for (const p of pts) {
        if (prevDate && p.read_at > prevDate) {
          intervals.push({
            start: prevDate,
            end: p.read_at,
            consumption: Math.max(0, p.reading - prevVal),
          });
        }
        prevVal = p.reading;
        prevDate = p.read_at;
      }
      const current = intervals[intervals.length - 1] ?? null;
      const baseline = current ? seasonalBaselineDaily(intervals.slice(0, -1), current) : null;
      const currentDaily = current ? dailyRate(current) : null;
      const anomalous =
        current != null && currentDaily != null && isAnomalous(currentDaily, baseline);
      const contract = m.contract_id ? contractById.get(m.contract_id) : null;
      return { meter: m, contract, current, currentDaily, baseline, anomalous };
    });
  }, [tenantMeters, readingsByMeter, contractById]);

  const hasData = chartData.some((d) => d.Общие > 0 || d.Арендаторы > 0);

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <Select value={service} onValueChange={setService}>
          <SelectTrigger aria-label="Услуга">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(METER_TYPE_LABELS).map(([k, l]) => (
              <SelectItem key={k} value={k}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="p-4">
        <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-primary" />
          Потребление за 12 месяцев, {unit}
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
          интервалов) более чем на 30%. При вводе такого показания владельцу и менеджерам приходит
          уведомление.
        </p>
      </Card>
    </div>
  );
}
