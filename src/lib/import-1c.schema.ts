/**
 * Формат файла обмена 1С → LeasePlease, версия 1.0 (zod-схема).
 * Зеркало docs/1c/1c-export.schema.json: то, что не проходит здесь,
 * приёмник отклоняет целиком с кодом 400 и списком путей.
 */
import { z } from "zod";

const guid = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "GUID 1С")
  .transform((s) => s.toLowerCase());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "дата ГГГГ-ММ-ДД");
const datetime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/, "ISO 8601 с поясом");
const money = z.number().finite();
const nstr = z.string().nullable().optional();
const ndate = date.nullable().optional();
const ndatetime = datetime.nullable().optional();
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .default("RUB");

export const CounterpartySchema = z.object({
  id: guid,
  code: nstr,
  kind: z.enum(["company", "entrepreneur", "person", "foreign"]),
  name: z.string().min(1),
  full_name: nstr,
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("RU"),
  inn: nstr,
  kpp: nstr,
  ogrn: nstr,
  foreign_tax_id: nstr,
  legal_address: nstr,
  actual_address: nstr,
  postal_address: nstr,
  bank: z
    .object({ name: nstr, bik: nstr, account: nstr, corr_account: nstr })
    .nullable()
    .optional(),
  signatory: z.object({ name: nstr, position: nstr, basis: nstr }).nullable().optional(),
  contacts: z
    .array(z.object({ name: z.string(), phone: nstr, email: nstr }))
    .max(5)
    .default([]),
  is_active: z.boolean().default(true),
  updated_at: ndatetime,
});

export const PropertySchema = z.object({
  id: guid,
  name: z.string().min(1),
  address: z.string().min(1),
  cadastral_no: nstr,
  type: z.enum([
    "office",
    "warehouse",
    "retail",
    "production",
    "coworking",
    "land",
    "parking",
    "other",
  ]),
  unit: z.enum(["sqm", "space", "lot"]).default("sqm"),
  area_total: z.number().min(0),
  area_usable: z.number().min(0).nullable().optional(),
  floor: nstr,
  room_no: nstr,
  own_use: z.boolean().default(false),
  updated_at: ndatetime,
});

export const ContractSchema = z.object({
  id: guid,
  number: z.string(),
  date: date,
  counterparty_id: guid,
  property_id: guid.nullable().optional(),
  kind: z.enum(["rent", "own_use"]).default("rent"),
  status: z.enum(["draft", "active", "finished", "terminated"]),
  start_date: date,
  end_date: ndate,
  handover_date: ndate,
  unit: z.enum(["sqm", "space", "lot"]).default("sqm"),
  area: z.number().min(0).nullable().optional(),
  rate: money,
  rate_period: z.enum(["monthly", "quarterly", "yearly", "one_time"]).default("monthly"),
  currency,
  vat_rate: z.number().nullable().optional(),
  vat_included: z.boolean().default(true),
  payment_day: z.number().int().min(1).max(31).nullable().optional(),
  payment_timing: z.enum(["advance", "current", "arrears"]).nullable().optional(),
  variable_part: z
    .object({
      enabled: z.boolean().default(false),
      payment_day: z.number().int().nullable().optional(),
      note: nstr,
    })
    .optional(),
  deposit: z
    .object({
      percent: z.number().nullable().optional(),
      amount: money.nullable().optional(),
      paid_at: ndate,
      status: z.enum(["none", "paid", "offset", "returned"]).default("none"),
    })
    .optional(),
  penalty_percent_per_day: z.number().nullable().optional(),
  auto_renew: z.boolean().default(false),
  renew_months: z.number().int().nullable().optional(),
  termination_notice_days: z.number().int().nullable().optional(),
  updated_at: ndatetime,
});

export const AmendmentSchema = z.object({
  id: guid,
  contract_id: guid,
  number: z.string(),
  date: date,
  effective_from: date,
  subject: nstr,
  changes: z
    .object({
      rate: money.nullable().optional(),
      area: z.number().nullable().optional(),
      end_date: ndate,
      payment_day: z.number().int().nullable().optional(),
      vat_rate: z.number().nullable().optional(),
      other: nstr,
    })
    .default({}),
  updated_at: ndatetime,
});

export const ChargeSchema = z.object({
  id: guid,
  doc_type: z.enum(["realization", "act", "invoice", "adjustment"]).default("realization"),
  number: z.string(),
  date: date,
  contract_id: guid,
  counterparty_id: guid,
  kind: z.enum(["rent", "utilities", "other"]).default("rent"),
  period_from: date,
  period_to: date,
  due_date: ndate,
  amount_without_vat: money,
  vat_amount: money,
  amount_total: money,
  currency,
  description: nstr,
  is_cancelled: z.boolean().default(false),
  updated_at: ndatetime,
});

export const OffsetSchema = z.object({
  basis_doc_id: guid.nullable().optional(),
  basis_doc_number: z.string(),
  basis_doc_date: date,
  counter_doc_id: guid.nullable().optional(),
  counter_doc_number: nstr,
  counter_doc_date: ndate,
  description: z.string(),
  expense_category: nstr,
});

export const PaymentSchema = z.object({
  id: guid,
  doc_type: z.enum(["bank_in", "cash_in", "offset", "return", "adjustment"]),
  number: z.string(),
  date: date,
  contract_id: guid.nullable().optional(),
  counterparty_id: guid,
  amount: money,
  currency,
  purpose: nstr,
  allocations: z.array(z.object({ charge_id: guid, amount: money })).default([]),
  offset: OffsetSchema.nullable().optional(),
  is_cancelled: z.boolean().default(false),
  updated_at: ndatetime,
});

export const BalanceSchema = z.object({
  counterparty_id: guid,
  contract_id: guid.nullable().optional(),
  as_of: date,
  debit: money,
  credit: money,
});

export const ImportFileSchema = z.object({
  format_version: z.literal("1.0"),
  source: z.object({
    system: z.string(),
    database: z.string().optional(),
    organization: z.object({ name: z.string().optional(), inn: z.string().optional() }).optional(),
    exported_at: datetime,
  }),
  period: z.object({ from: date, to: date }),
  mode: z.enum(["window", "full"]).default("window"),
  counterparties: z.array(CounterpartySchema),
  properties: z.array(PropertySchema).default([]),
  contracts: z.array(ContractSchema),
  amendments: z.array(AmendmentSchema).default([]),
  charges: z.array(ChargeSchema),
  payments: z.array(PaymentSchema),
  balances: z.array(BalanceSchema).default([]),
});

export type ImportFile = z.infer<typeof ImportFileSchema>;
export type Counterparty = z.infer<typeof CounterpartySchema>;
export type PropertyIn = z.infer<typeof PropertySchema>;
export type ContractIn = z.infer<typeof ContractSchema>;
export type AmendmentIn = z.infer<typeof AmendmentSchema>;
export type ChargeIn = z.infer<typeof ChargeSchema>;
export type PaymentIn = z.infer<typeof PaymentSchema>;
export type BalanceIn = z.infer<typeof BalanceSchema>;

/** Ошибки zod → список «путь: сообщение», понятный исполнителю на стороне 1С. */
export function formatSchemaErrors(err: z.ZodError): { path: string; message: string }[] {
  return err.issues.slice(0, 200).map((i) => ({
    path: i.path
      .map((p) => (typeof p === "number" ? `[${p}]` : `.${p}`))
      .join("")
      .replace(/^\./, ""),
    message: i.message,
  }));
}

/**
 * Ссылочная целостность внутри файла: все *_id должны указывать на записи
 * файла (или на уже известные приёмнику GUID — это проверяет движок).
 */
export function findDanglingRefs(
  file: ImportFile,
  known: { contracts: Set<string>; charges: Set<string> },
) {
  const cps = new Set(file.counterparties.map((c) => c.id));
  const props = new Set(file.properties.map((p) => p.id));
  const contracts = new Set([...file.contracts.map((c) => c.id), ...known.contracts]);
  const charges = new Set([...file.charges.map((c) => c.id), ...known.charges]);
  const out: { path: string; message: string }[] = [];
  file.contracts.forEach((c, i) => {
    if (!cps.has(c.counterparty_id))
      out.push({
        path: `contracts[${i}].counterparty_id`,
        message: "контрагент не найден в файле",
      });
    if (c.property_id && file.properties.length > 0 && !props.has(c.property_id))
      out.push({ path: `contracts[${i}].property_id`, message: "объект не найден в файле" });
  });
  file.amendments.forEach((a, i) => {
    if (!contracts.has(a.contract_id))
      out.push({ path: `amendments[${i}].contract_id`, message: "договор не найден" });
  });
  file.charges.forEach((c, i) => {
    if (!contracts.has(c.contract_id))
      out.push({ path: `charges[${i}].contract_id`, message: "договор не найден" });
    if (!cps.has(c.counterparty_id))
      out.push({ path: `charges[${i}].counterparty_id`, message: "контрагент не найден в файле" });
  });
  file.payments.forEach((p, i) => {
    if (!cps.has(p.counterparty_id))
      out.push({ path: `payments[${i}].counterparty_id`, message: "контрагент не найден в файле" });
    if (p.contract_id && !contracts.has(p.contract_id))
      out.push({ path: `payments[${i}].contract_id`, message: "договор не найден" });
    p.allocations.forEach((a, j) => {
      if (!charges.has(a.charge_id))
        out.push({
          path: `payments[${i}].allocations[${j}].charge_id`,
          message: "начисление не найдено",
        });
    });
    if (p.doc_type === "offset" && !p.offset)
      out.push({ path: `payments[${i}].offset`, message: "для doc_type=offset нужен блок offset" });
  });
  return out;
}
