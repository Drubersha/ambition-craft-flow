/**
 * Преобразование значений формы договора в строку таблицы `contracts`.
 * Общее для создания и редактирования: набор полей и правила приведения
 * («пусто → null», ставка/площадь числом, депозит от месячного платежа)
 * должны совпадать, иначе договор менял бы смысл при сохранении.
 */
import { computeDepositWithArea } from "./format";

/** Поля формы, из которых собирается строка договора. */
export type ContractRowInput = {
  tenant_id: string;
  property_id: string;
  number?: string;
  cadastral_no?: string;
  area?: string;
  unit?: string;
  rate: string;
  currency?: string;
  payment_period: string;
  status: string;
  kind: string;
  start_date: string;
  end_date?: string;
  notes?: string;
  termination_terms?: string;
  deposit_percent?: string;
  vat_rate?: string;
  vat_included?: boolean;
  payment_day?: string;
  payment_timing?: string;
  has_variable_part?: boolean;
  variable_payment_day?: string;
  variable_part_note?: string;
  penalty_percent_per_day?: string;
  misuse_penalty_percent?: string;
  handover_date?: string;
  auto_renew?: boolean;
  renew_months?: string;
  termination_notice_days?: string;
  deposit_paid_at?: string;
  ownership_basis?: string;
  jurisdiction?: string;
};

/** Пустое поле формы → NULL: «не заполнено» и «ноль» — разные вещи. */
const numOrNull = (s: string | undefined) =>
  s === undefined || s.trim() === "" ? null : Number(s);
const textOrNull = (s: string | undefined) => s?.trim() || null;

export function contractRowFromForm(v: ContractRowInput) {
  const rate = Number(v.rate) || 0;
  const area = Number(v.area) || 0;
  return {
    tenant_id: v.tenant_id,
    property_id: v.property_id,
    number: v.number || null,
    cadastral_no: v.cadastral_no || null,
    // Площадь может быть не заполнена (договор с фиксированной суммой).
    area: v.area ? Number(v.area) : null,
    unit: (v.unit as any) || "sqm",
    rate,
    currency: v.currency || "RUB",
    payment_period: v.payment_period as any,
    status: v.status as any,
    kind: v.kind as any,
    start_date: v.start_date,
    end_date: v.end_date || null,
    notes: v.notes || null,
    termination_terms: v.termination_terms || null,
    deposit_percent: v.deposit_percent ? Number(v.deposit_percent) : null,
    deposit_amount: v.deposit_percent
      ? computeDepositWithArea(rate, v.payment_period, area, Number(v.deposit_percent))
      : null,
    vat_rate: numOrNull(v.vat_rate),
    vat_included: v.vat_included ?? true,
    payment_day: numOrNull(v.payment_day),
    payment_timing: textOrNull(v.payment_timing),
    has_variable_part: v.has_variable_part ?? false,
    variable_payment_day: numOrNull(v.variable_payment_day),
    variable_part_note: textOrNull(v.variable_part_note),
    penalty_percent_per_day: numOrNull(v.penalty_percent_per_day),
    misuse_penalty_percent: numOrNull(v.misuse_penalty_percent),
    handover_date: textOrNull(v.handover_date),
    auto_renew: v.auto_renew ?? false,
    renew_months: numOrNull(v.renew_months),
    termination_notice_days: numOrNull(v.termination_notice_days),
    deposit_paid_at: textOrNull(v.deposit_paid_at),
    ownership_basis: textOrNull(v.ownership_basis),
    jurisdiction: textOrNull(v.jurisdiction),
  };
}
