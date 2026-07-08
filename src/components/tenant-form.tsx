import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { TENANT_KIND_LABELS } from "@/lib/format";

export const MAX_CONTACTS = 5;

export type TenantContactDraft = {
  /** Existing row id (undefined for new rows). */
  id?: string;
  full_name: string;
  email: string;
  phone: string;
};

export type TenantFormValues = {
  name: string;
  kind: string;
  inn: string;
  notes: string;
  /** 1..5 валидных контактных лиц (первое обязательно). */
  contacts: TenantContactDraft[];
};

const emptyContact = (): TenantContactDraft => ({ full_name: "", email: "", phone: "" });

function contactFilled(c: TenantContactDraft): boolean {
  return !!(c.full_name.trim() || c.email.trim() || c.phone.trim());
}

/** Человеко-читаемая ошибка валидации контакта, или null если контакт валиден. */
export function contactIssue(c: TenantContactDraft, index: number): string | null {
  if (!c.full_name.trim()) return `Контактное лицо ${index + 1}: укажите ФИО`;
  if (!c.email.trim() && !c.phone.trim())
    return `Контактное лицо ${index + 1} (${c.full_name.trim()}): укажите email или телефон`;
  return null;
}

export function TenantForm({
  initial,
  onSubmit,
  submitting,
  formId,
  hideSubmit,
}: {
  initial?: Partial<TenantFormValues>;
  onSubmit: (v: TenantFormValues) => void;
  submitting?: boolean;
  formId?: string;
  hideSubmit?: boolean;
}) {
  const [v, setV] = useState<Omit<TenantFormValues, "contacts">>({
    name: initial?.name ?? "",
    kind: initial?.kind ?? "company",
    inn: initial?.inn ?? "",
    notes: initial?.notes ?? "",
  });
  const [contacts, setContacts] = useState<TenantContactDraft[]>(
    initial?.contacts && initial.contacts.length > 0 ? initial.contacts : [emptyContact()],
  );
  const set = <K extends keyof Omit<TenantFormValues, "contacts">>(
    k: K,
    val: TenantFormValues[K],
  ) => setV((p) => ({ ...p, [k]: val }));
  const setContact = (i: number, patch: Partial<TenantContactDraft>) =>
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Первое контактное лицо обязательно; дополнительные валидируются, только
    // если заполнены (пустые строки молча отбрасываются).
    const meaningful = contacts.filter((c, i) => i === 0 || contactFilled(c));
    for (let i = 0; i < meaningful.length; i++) {
      const issue = contactIssue(meaningful[i], i);
      if (issue) {
        toast.error(issue);
        return;
      }
    }
    onSubmit({ ...v, contacts: meaningful });
  };

  return (
    <form id={formId} onSubmit={submit} className="space-y-4 max-w-2xl">
      <F label="Название / ФИО *">
        <Input required value={v.name} onChange={(e) => set("name", e.target.value)} />
      </F>
      <F label="Тип">
        <Select value={v.kind} onValueChange={(x) => set("kind", x)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TENANT_KIND_LABELS).map(([k, l]) => (
              <SelectItem key={k} value={k}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </F>
      <F label="ИНН">
        <Input value={v.inn} onChange={(e) => set("inn", e.target.value)} />
      </F>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Контактные лица *</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={contacts.length >= MAX_CONTACTS}
            onClick={() => setContacts((prev) => [...prev, emptyContact()])}
          >
            <Plus className="h-4 w-4 mr-1" />
            Добавить ({contacts.length}/{MAX_CONTACTS})
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Минимум одно контактное лицо: ФИО и email и/или телефон. Email первого контакта
          используется для входа арендатора в кабинет.
        </p>
        <div className="space-y-3">
          {contacts.map((c, i) => (
            <div key={c.id ?? `new-${i}`} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <UserRound className="h-3.5 w-3.5" />
                  {i === 0 ? "Основное контактное лицо" : `Контактное лицо ${i + 1}`}
                </div>
                {i > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Удалить контактное лицо"
                    onClick={() => setContacts((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <F label="ФИО *">
                <Input
                  required={i === 0}
                  value={c.full_name}
                  onChange={(e) => setContact(i, { full_name: e.target.value })}
                />
              </F>
              <div className="grid sm:grid-cols-2 gap-3">
                <F label={i === 0 ? "Email *" : "Email"}>
                  <Input
                    type="email"
                    value={c.email}
                    onChange={(e) => setContact(i, { email: e.target.value })}
                  />
                </F>
                <F label={i === 0 ? "Телефон *" : "Телефон"}>
                  <Input
                    type="tel"
                    value={c.phone}
                    onChange={(e) => setContact(i, { phone: e.target.value })}
                  />
                </F>
              </div>
              {i === 0 && (
                <p className="text-[11px] text-muted-foreground">* — email и/или телефон</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <F label="Заметки">
        <Textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </F>
      {!hideSubmit && (
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? "Сохранение..." : "Сохранить"}
        </Button>
      )}
    </form>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
