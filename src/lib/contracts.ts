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
};

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
  };
}
