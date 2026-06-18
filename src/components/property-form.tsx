import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/format";

export type PropertyFormValues = {
  name: string;
  address: string;
  type: string;
  cadastral_no: string;
  area_total: string;
  area_usable: string;
  floor: string;
  room_no: string;
  status: string;
  base_rate: string;
  currency: string;
  description: string;
};

export function PropertyForm({
  initial,
  onSubmit,
  submitting,
  formId,
  hideSubmit,
}: {
  initial?: Partial<PropertyFormValues>;
  onSubmit: (v: PropertyFormValues) => void;
  submitting?: boolean;
  formId?: string;
  hideSubmit?: boolean;
}) {
  const [v, setV] = useState<PropertyFormValues>({
    name: initial?.name ?? "",
    address: initial?.address ?? "",
    type: initial?.type ?? "office",
    cadastral_no: initial?.cadastral_no ?? "",
    area_total: initial?.area_total ?? "",
    area_usable: initial?.area_usable ?? "",
    floor: initial?.floor ?? "",
    room_no: initial?.room_no ?? "",
    status: initial?.status ?? "free",
    base_rate: initial?.base_rate ?? "",
    currency: initial?.currency ?? "RUB",
    description: initial?.description ?? "",
  });

  const set = <K extends keyof PropertyFormValues>(k: K, val: PropertyFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      className="space-y-4 max-w-2xl"
    >
      <Field label="Название *"><Input required value={v.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Адрес *"><Input required value={v.address} onChange={(e) => set("address", e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Тип">
          <Select value={v.type} onValueChange={(x) => set("type", x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Статус">
          <Select value={v.status} onValueChange={(x) => set("status", x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROPERTY_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Кадастровый номер"><Input value={v.cadastral_no} onChange={(e) => set("cadastral_no", e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Общая площадь, м² *"><Input type="number" step="0.01" required value={v.area_total} onChange={(e) => set("area_total", e.target.value)} /></Field>
        <Field label="Полезная площадь, м²"><Input type="number" step="0.01" value={v.area_usable} onChange={(e) => set("area_usable", e.target.value)} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Этаж"><Input value={v.floor} onChange={(e) => set("floor", e.target.value)} /></Field>
        <Field label="Номер помещения"><Input value={v.room_no} onChange={(e) => set("room_no", e.target.value)} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Базовая ставка"><Input type="number" step="0.01" value={v.base_rate} onChange={(e) => set("base_rate", e.target.value)} /></Field>
        <Field label="Валюта"><Input value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></Field>
      </div>
      <Field label="Описание"><Textarea rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} /></Field>
      {!hideSubmit && (
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? "Сохранение..." : "Сохранить"}</Button>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}