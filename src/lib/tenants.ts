/**
 * Преобразование значений формы арендатора в строку таблицы `tenants`.
 * Общее для создания и редактирования: набор полей и правило «пусто → null»
 * должны совпадать, иначе реквизиты терялись бы при одном из путей сохранения.
 */
import type { TenantFormValues } from "@/components/tenant-form";

/** Пустая строка → null: в базе отсутствующий реквизит должен быть NULL, а не "". */
const orNull = (s: string | undefined) => s?.trim() || null;

export function tenantRowFromForm(v: TenantFormValues) {
  const primary = v.contacts[0];
  return {
    name: v.name,
    kind: v.kind as any,
    inn: orNull(v.inn),
    // Устаревшие поля дублируют основной контакт: по tenants.email кабинет
    // арендатора находит аккаунт, а поиск в списке ищет по phone/email.
    phone: primary?.phone.trim() || null,
    email: primary?.email.trim() || null,
    contact_person: primary?.full_name.trim() || null,
    notes: orNull(v.notes),
    kpp: orNull(v.kpp),
    ogrn: orNull(v.ogrn),
    legal_address: orNull(v.legal_address),
    actual_address: orNull(v.actual_address),
    postal_address: orNull(v.postal_address),
    bank_name: orNull(v.bank_name),
    bank_account: orNull(v.bank_account),
    bank_bik: orNull(v.bank_bik),
    bank_corr_account: orNull(v.bank_corr_account),
    signatory_name: orNull(v.signatory_name),
    signatory_position: orNull(v.signatory_position),
    signatory_basis: orNull(v.signatory_basis),
  };
}
