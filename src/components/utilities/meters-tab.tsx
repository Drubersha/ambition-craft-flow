import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { MeterTypeSelect } from "@/components/utilities/meter-type-select";
import { Gauge, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { METER_TYPE_LABELS, METER_UNITS, formatDate } from "@/lib/format";
import {
  contractDisplayLabel,
  insertMeterReading,
  lastReadingByMeter,
  meterLastValue,
  type Meter,
  type MeterReading,
} from "@/lib/meters";
import { useEffectiveOwnerId } from "@/lib/manager-context";

/** Вкладка «Счётчики»: реестр с последними показаниями, добавление и удаление. */
export function MetersTab({
  meters,
  readings,
  folders,
  properties,
  contracts,
  propertyById,
  contractById,
}: {
  meters: Meter[];
  readings: MeterReading[];
  folders: { id: string; name: string }[];
  properties: { id: string; name: string; folder_id: string | null }[];
  contracts: any[];
  propertyById: Map<string, any>;
  contractById: Map<string, any>;
}) {
  const lastByMeter = useMemo(() => lastReadingByMeter(readings), [readings]);

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
                    <TableCell>
                      {m.contract_id ? contractDisplayLabel(contractById.get(m.contract_id)) : "—"}
                    </TableCell>
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
              <MeterTypeSelect value={type} onChange={setType} />
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
                      {contractDisplayLabel(c)}
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

function AddReadingDialog({ meter, last }: { meter: Meter; last: MeterReading | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();
  const unit = METER_UNITS[meter.type] ?? "";
  const lastValue = meterLastValue(meter, last);

  const mut = useMutation({
    mutationFn: () =>
      insertMeterReading({ meter, lastValue, value, readAt: date, source: "owner" }),
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
