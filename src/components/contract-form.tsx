import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTRACT_STATUS_LABELS, PAYMENT_PERIOD_LABELS } from "@/lib/format";

export type ContractFormValues = {
  tenant_id: string;
  property_id: string;
  number: string;
  cadastral_no: string;
  area: string;
  rate: string;
  currency: string;
  payment_period: string;
  start_date: string;
  end_date: string;
  status: string;
  notes: string;
};

export function ContractForm({ initial, onSubmit, submitting, formId, hideSubmit }: {
  initial?: Partial<ContractFormValues>;
  onSubmit: (v: ContractFormValues) => void;
  submitting?: boolean;
  formId?: string;
  hideSubmit?: boolean;
}) {
  const [v, setV] = useState<ContractFormValues>({
    tenant_id: initial?.tenant_id ?? "",
    property_id: initial?.property_id ?? "",
    number: initial?.number ?? "",
    cadastral_no: initial?.cadastral_no ?? "",
    area: initial?.area ?? "",
    rate: initial?.rate ?? "",
    currency: initial?.currency ?? "RUB",
    payment_period: initial?.payment_period ?? "monthly",
    start_date: initial?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: initial?.end_date ?? "",
    status: initial?.status ?? "active",
    notes: initial?.notes ?? "",
  });
  const set = <K extends keyof ContractFormValues>(k: K, val: ContractFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  const { data: tenants } = useQuery({
    queryKey: ["tenants-list"],
    queryFn: async () => (await supabase.from("tenants").select("id,name").order("name")).data ?? [],
  });
  const { data: properties } = useQuery({
    queryKey: ["properties-list"],
    queryFn: async () => (await supabase.from("properties").select("id,name,cadastral_no,area_total,base_rate").order("name")).data ?? [],
  });

  function onPropertyChange(id: string) {
    set("property_id", id);
    const p = properties?.find((x) => x.id === id);
    if (p) {
      if (!v.cadastral_no && p.cadastral_no) set("cadastral_no", p.cadastral_no);
      if (!v.area && p.area_total) set("area", String(p.area_total));
      if (!v.rate && p.base_rate) set("rate", String(p.base_rate));
    }
  }

  return (
    <form id={formId} onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-4 max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="Арендатор *">
          <Select value={v.tenant_id} onValueChange={(x) => set("tenant_id", x)}>
            <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
            <SelectContent>{tenants?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="Объект *">
          <Select value={v.property_id} onValueChange={onPropertyChange}>
            <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
            <SelectContent>{properties?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </F>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="Номер договора *"><Input required value={v.number} onChange={(e) => set("number", e.target.value)} /></F>
        <F label="Кадастровый номер"><Input value={v.cadastral_no} onChange={(e) => set("cadastral_no", e.target.value)} /></F>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <F label="Площадь, м²"><Input type="number" step="0.01" value={v.area} onChange={(e) => set("area", e.target.value)} /></F>
        <F label="Ставка *"><Input type="number" step="0.01" required value={v.rate} onChange={(e) => set("rate", e.target.value)} /></F>
        <F label="Валюта"><Input value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></F>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <F label="Периодичность">
          <Select value={v.payment_period} onValueChange={(x) => set("payment_period", x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(PAYMENT_PERIOD_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="Начало *"><Input type="date" required value={v.start_date} onChange={(e) => set("start_date", e.target.value)} /></F>
        <F label="Окончание"><Input type="date" value={v.end_date} onChange={(e) => set("end_date", e.target.value)} /></F>
      </div>
      <F label="Статус">
        <Select value={v.status} onValueChange={(x) => set("status", x)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(CONTRACT_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </F>
      <F label="Заметки"><Textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} /></F>
      {!hideSubmit && (
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? "Сохранение..." : "Сохранить"}</Button>
      )}
    </form>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}