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
  /** Реквизиты — нужны для счетов, актов и сверок; заполняются из договора. */
  kpp: string;
  ogrn: string;
  legal_address: string;
  actual_address: string;
  postal_address: string;
  bank_name: string;
  bank_account: string;
  bank_bik: string;
  bank_corr_account: string;
  /** Кто подписывает и на каком основании («Генеральный директор …, устав»). */
  signatory_name: string;
  signatory_position: string;
  signatory_basis: string;
  /** 1..5 валидных контактных лиц (первое обязательно). */
  contacts: TenantContactDraft[];
};

/** Пустые значения реквизитов — общий дефолт для формы и вызывающих страниц. */
export const EMPTY_TENANT_REQUISITES = {
  kpp: "",
  ogrn: "",
  legal_address: "",
  actual_address: "",
  postal_address: "",
  bank_name: "",
  bank_account: "",
  bank_bik: "",
  bank_corr_account: "",
  signatory_name: "",
  signatory_position: "",
  signatory_basis: "",
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
    kpp: initial?.kpp ?? "",
    ogrn: initial?.ogrn ?? "",
    legal_address: initial?.legal_address ?? "",
    actual_address: initial?.actual_address ?? "",
    postal_address: initial?.postal_address ?? "",
    bank_name: initial?.bank_name ?? "",
    bank_account: initial?.bank_account ?? "",
    bank_bik: initial?.bank_bik ?? "",
    bank_corr_account: initial?.bank_corr_account ?? "",
    signatory_name: initial?.signatory_name ?? "",
    signatory_position: initial?.signatory_position ?? "",
    signatory_basis: initial?.signatory_basis ?? "",
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
      <div className="grid sm:grid-cols-2 gap-3">
        <F label="ИНН">
          <Input value={v.inn} onChange={(e) => set("inn", e.target.value)} />
        </F>
        <F label="КПП">
          <Input value={v.kpp} onChange={(e) => set("kpp", e.target.value)} />
        </F>
      </div>

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Реквизиты для счетов и актов
        </summary>
        <div className="mt-3 space-y-3">
          <F label="ОГРН / ОГРНИП">
            <Input value={v.ogrn} onChange={(e) => set("ogrn", e.target.value)} />
          </F>
          <F label="Юридический адрес">
            <Input value={v.legal_address} onChange={(e) => set("legal_address", e.target.value)} />
          </F>
          <F label="Фактический адрес">
            <Input
              value={v.actual_address}
              onChange={(e) => set("actual_address", e.target.value)}
              placeholder="если отличается от юридического"
            />
          </F>
          <F label="Почтовый адрес">
            <Input
              value={v.postal_address}
              onChange={(e) => set("postal_address", e.target.value)}
            />
          </F>
          <F label="Банк">
            <Input value={v.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
          </F>
          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Расчётный счёт">
              <Input value={v.bank_account} onChange={(e) => set("bank_account", e.target.value)} />
            </F>
            <F label="БИК">
              <Input value={v.bank_bik} onChange={(e) => set("bank_bik", e.target.value)} />
            </F>
          </div>
          <F label="Корреспондентский счёт">
            <Input
              value={v.bank_corr_account}
              onChange={(e) => set("bank_corr_account", e.target.value)}
            />
          </F>
          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Подписант (ФИО)">
              <Input
                value={v.signatory_name}
                onChange={(e) => set("signatory_name", e.target.value)}
                placeholder="Хасбиев Д. Ш."
              />
            </F>
            <F label="Должность">
              <Input
                value={v.signatory_position}
                onChange={(e) => set("signatory_position", e.target.value)}
                placeholder="Генеральный директор"
              />
            </F>
          </div>
          <F label="Действует на основании">
            <Input
              value={v.signatory_basis}
              onChange={(e) => set("signatory_basis", e.target.value)}
              placeholder="устава / доверенности № … от …"
            />
          </F>
        </div>
      </details>

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
