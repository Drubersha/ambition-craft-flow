/**
 * Преобразование значений формы арендатора в строку таблицы `tenants`.
 * Общее для создания и редактирования: набор полей и правило «пусто → null»
 * должны совпадать, иначе реквизиты терялись бы при одном из путей сохранения.
 */
import type { TenantContactDraft, TenantFormValues } from "@/components/tenant-form";
import type { Enums } from "@/integrations/supabase/types";
import { textOrNull } from "./format";

export function tenantRowFromForm(v: TenantFormValues) {
  const primary = v.contacts[0];
  return {
    name: v.name,
    kind: v.kind as Enums<"tenant_kind">,
    inn: textOrNull(v.inn),
    // Устаревшие поля дублируют основной контакт: по tenants.email кабинет
    // арендатора находит аккаунт, а поиск в списке ищет по phone/email.
    phone: textOrNull(primary?.phone),
    email: textOrNull(primary?.email),
    contact_person: textOrNull(primary?.full_name),
    notes: textOrNull(v.notes),
    kpp: textOrNull(v.kpp),
    ogrn: textOrNull(v.ogrn),
    legal_address: textOrNull(v.legal_address),
    actual_address: textOrNull(v.actual_address),
    postal_address: textOrNull(v.postal_address),
    bank_name: textOrNull(v.bank_name),
    bank_account: textOrNull(v.bank_account),
    bank_bik: textOrNull(v.bank_bik),
    bank_corr_account: textOrNull(v.bank_corr_account),
    signatory_name: textOrNull(v.signatory_name),
    signatory_position: textOrNull(v.signatory_position),
    signatory_basis: textOrNull(v.signatory_basis),
  };
}

/** Строка `tenant_contacts` из контакта формы: правило «пусто → null» общее для создания и правки. */
export function tenantContactRowFromForm(c: TenantContactDraft, sortOrder: number) {
  return {
    full_name: c.full_name.trim(),
    email: textOrNull(c.email),
    phone: textOrNull(c.phone),
    sort_order: sortOrder,
  };
}
