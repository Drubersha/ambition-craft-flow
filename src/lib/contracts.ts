/**
 * Преобразование значений формы договора в строку таблицы `contracts`.
 * Общее для создания и редактирования: набор полей и правила приведения
 * («пусто → null», ставка/площадь числом, депозит от месячного платежа)
 * должны совпадать, иначе договор менял бы смысл при сохранении.
 */
import type { ContractFormValues } from "@/components/contract-form";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { computeDepositWithArea } from "./format";

/** Верхняя граница процента депозита; совпадает с CHECK contracts_deposit_percent_range (20260708130000_money_checks.sql). */
export const DEPOSIT_PERCENT_MAX = 1000;

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
  amendment_subject?: string;
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
    unit: (v.unit as Enums<"lease_unit">) || "sqm",
    rate,
    currency: v.currency || "RUB",
    payment_period: v.payment_period as Enums<"payment_period">,
    status: v.status as Enums<"contract_status">,
    kind: v.kind as Enums<"contract_kind">,
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
    amendment_subject: textOrNull(v.amendment_subject),
  };
}

/**
 * Обратное преобразование: строка договора → значения формы (без счётчиков).
 * Используется страницей договора и созданием допсоглашения; дефолты те же,
 * что у пустой формы, чтобы «сохранить без правок» не менял договор.
 */
export function contractFormFromRow(
  c: Partial<Tables<"contracts">>,
): Omit<ContractFormValues, "meters"> {
  const str = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return {
    tenant_id: str(c.tenant_id),
    property_id: str(c.property_id),
    number: str(c.number),
    cadastral_no: str(c.cadastral_no),
    area: str(c.area),
    rate: str(c.rate),
    currency: str(c.currency) || "RUB",
    payment_period: str(c.payment_period) || "monthly",
    start_date: str(c.start_date),
    end_date: str(c.end_date),
    status: str(c.status) || "active",
    kind: str(c.kind) || "rent",
    notes: str(c.notes),
    termination_terms: str(c.termination_terms),
    deposit_percent: str(c.deposit_percent),
    unit: str(c.unit) || "sqm",
    vat_rate: str(c.vat_rate),
    vat_included: c.vat_included ?? true,
    payment_day: str(c.payment_day),
    payment_timing: str(c.payment_timing),
    has_variable_part: c.has_variable_part ?? false,
    variable_payment_day: str(c.variable_payment_day),
    variable_part_note: str(c.variable_part_note),
    penalty_percent_per_day: str(c.penalty_percent_per_day),
    misuse_penalty_percent: str(c.misuse_penalty_percent),
    handover_date: str(c.handover_date),
    auto_renew: c.auto_renew ?? false,
    renew_months: str(c.renew_months),
    termination_notice_days: str(c.termination_notice_days),
    deposit_paid_at: str(c.deposit_paid_at),
    ownership_basis: str(c.ownership_basis),
    jurisdiction: str(c.jurisdiction),
    amendment_subject: str(c.amendment_subject),
  };
}
