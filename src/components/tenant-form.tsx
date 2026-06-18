import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TENANT_KIND_LABELS } from "@/lib/format";

export type TenantFormValues = {
  name: string;
  kind: string;
  inn: string;
  phone: string;
  email: string;
  contact_person: string;
  notes: string;
};

export function TenantForm({ initial, onSubmit, submitting, formId, hideSubmit }: {
  initial?: Partial<TenantFormValues>;
  onSubmit: (v: TenantFormValues) => void;
  submitting?: boolean;
  formId?: string;
  hideSubmit?: boolean;
}) {
  const [v, setV] = useState<TenantFormValues>({
    name: initial?.name ?? "", kind: initial?.kind ?? "company",
    inn: initial?.inn ?? "", phone: initial?.phone ?? "", email: initial?.email ?? "",
    contact_person: initial?.contact_person ?? "", notes: initial?.notes ?? "",
  });
  const set = <K extends keyof TenantFormValues>(k: K, val: TenantFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <form id={formId} onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-4 max-w-2xl">
      <F label="Название / ФИО *"><Input required value={v.name} onChange={(e) => set("name", e.target.value)} /></F>
      <F label="Тип">
        <Select value={v.kind} onValueChange={(x) => set("kind", x)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(TENANT_KIND_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </F>
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="ИНН"><Input value={v.inn} onChange={(e) => set("inn", e.target.value)} /></F>
        <F label="Контактное лицо"><Input value={v.contact_person} onChange={(e) => set("contact_person", e.target.value)} /></F>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="Телефон"><Input value={v.phone} onChange={(e) => set("phone", e.target.value)} /></F>
        <F label="Email"><Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></F>
      </div>
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