/**
 * Дополнительные соглашения: сравнение условий допника с основным договором.
 *
 * Модель: допсоглашение — это строка `contracts` с заполненным
 * `parent_contract_id`, у неё свой номер и своя дата. Основной договор всегда
 * хранит ДЕЙСТВУЮЩИЕ условия (их читают дашборд, начисления и отчёты), а
 * допсоглашения — историю изменений. Поэтому при создании допника изменённые
 * поля переносятся в основной договор, а сам допник остаётся документом.
 *
 * Здесь только чистые функции: что с чем сравнивать и как показать разницу.
 */
import {
  CONTRACT_STATUS_LABELS,
  PAYMENT_PERIOD_LABELS,
  formatDate,
  formatMoney,
  formatNum,
} from "./format";

/** Как показывать значение поля человеку. */
type Kind = "money" | "number" | "date" | "bool" | "text" | "period" | "status" | "timing" | "unit";

type FieldSpec = { key: string; label: string; kind: Kind };

/** К какому месяцу относится день оплаты — те же подписи, что в форме. */
const TIMING_LABELS: Record<string, string> = {
  advance: "предоплата (до N числа предыдущего месяца)",
  current: "в расчётном месяце (до N числа)",
  arrears: "постоплата (до N числа следующего месяца)",
};

const UNIT_NAMES: Record<string, string> = {
  sqm: "квадратные метры",
  space: "машиноместа",
  lot: "лоты",
};

/**
 * Поля, изменение которых имеет смысл фиксировать допсоглашением.
 * Порядок задаёт порядок строк в списке изменений.
 */
export const AMENDMENT_FIELDS: FieldSpec[] = [
  { key: "property_id", label: "Объект", kind: "text" },
  { key: "area", label: "Площадь / количество", kind: "number" },
  { key: "unit", label: "Единица измерения", kind: "unit" },
  { key: "rate", label: "Ставка", kind: "money" },
  { key: "currency", label: "Валюта", kind: "text" },
  { key: "payment_period", label: "Периодичность платежа", kind: "period" },
  { key: "vat_rate", label: "Ставка НДС, %", kind: "number" },
  { key: "vat_included", label: "НДС в том числе", kind: "bool" },
  { key: "payment_day", label: "День оплаты", kind: "number" },
  { key: "payment_timing", label: "Порядок оплаты", kind: "timing" },
  { key: "has_variable_part", label: "Переменная часть", kind: "bool" },
  { key: "variable_payment_day", label: "День оплаты переменной части", kind: "number" },
  { key: "penalty_percent_per_day", label: "Пени за день просрочки, %", kind: "number" },
  { key: "misuse_penalty_percent", label: "Штраф за нецелевое, %", kind: "number" },
  { key: "deposit_percent", label: "Обеспечительный платёж, %", kind: "number" },
  { key: "start_date", label: "Дата начала", kind: "date" },
  { key: "end_date", label: "Дата окончания", kind: "date" },
  { key: "auto_renew", label: "Автопролонгация", kind: "bool" },
  { key: "renew_months", label: "Продление, месяцев", kind: "number" },
  { key: "termination_notice_days", label: "Уведомление о расторжении, дней", kind: "number" },
  { key: "status", label: "Статус", kind: "status" },
  { key: "jurisdiction", label: "Подсудность", kind: "text" },
  { key: "ownership_basis", label: "Основание права собственности", kind: "text" },
];

export type TermChange = {
  key: string;
  label: string;
  /** Значение до и после — уже отформатированные для показа. */
  before: string;
  after: string;
};

/** «Не заполнено» — единый вид для null, undefined и пустой строки. */
const EMPTY = "—";

function display(value: unknown, kind: Kind, currency: string, names: PropertyNames): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  switch (kind) {
    case "money":
      return formatMoney(Number(value), currency);
    case "number":
      return formatNum(Number(value));
    case "date":
      return formatDate(String(value));
    case "bool":
      return value ? "да" : "нет";
    case "period":
      return PAYMENT_PERIOD_LABELS[String(value)] ?? String(value);
    case "status":
      return CONTRACT_STATUS_LABELS[String(value)] ?? String(value);
    case "timing":
      return TIMING_LABELS[String(value)] ?? String(value);
    case "unit":
      return UNIT_NAMES[String(value)] ?? String(value);
    default:
      return names[String(value)] ?? String(value);
  }
}

/** Числа из Postgres приходят строками — сравниваем по значению, а не по виду. */
function sameValue(a: unknown, b: unknown, kind: Kind): boolean {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return true;
  if (aEmpty !== bEmpty) return false;
  if (kind === "number" || kind === "money") {
    // «279.58» и 279.5800 — одно и то же число.
    return Math.abs(Number(a) - Number(b)) < 0.0001;
  }
  if (kind === "bool") return Boolean(a) === Boolean(b);
  if (kind === "date") return String(a).slice(0, 10) === String(b).slice(0, 10);
  return String(a) === String(b);
}

/** Соответствие id объекта его названию — чтобы не показывать пользователю UUID. */
export type PropertyNames = Record<string, string>;

/**
 * Чем допсоглашение отличается от основного договора.
 * Пустой массив означает, что условия совпадают — такое допсоглашение
 * ничего не меняет, и об этом стоит предупредить.
 */
export function diffContractTerms(
  parent: Record<string, unknown> | null | undefined,
  amendment: Record<string, unknown> | null | undefined,
  propertyNames: PropertyNames = {},
): TermChange[] {
  if (!parent || !amendment) return [];
  const currency = String(amendment.currency || parent.currency || "RUB");
  const out: TermChange[] = [];
  for (const f of AMENDMENT_FIELDS) {
    const before = parent[f.key];
    const after = amendment[f.key];
    if (sameValue(before, after, f.kind)) continue;
    out.push({
      key: f.key,
      label: f.label,
      before: display(before, f.kind, currency, propertyNames),
      after: display(after, f.kind, currency, propertyNames),
    });
  }
  return out;
}

/**
 * Поля, которые нужно перенести из допсоглашения в основной договор,
 * чтобы он отражал действующие условия. Служебные поля документа (номер,
 * дата подписания, привязка к родителю, предмет) не переносятся.
 */
const NOT_INHERITED = new Set(["number", "parent_contract_id", "amendment_subject", "notes"]);

export function termsToApply(
  changes: TermChange[],
  amendment: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const c of changes) {
    if (NOT_INHERITED.has(c.key)) continue;
    patch[c.key] = amendment[c.key] ?? null;
  }
  return patch;
}

/** Краткая строка изменений для списка допсоглашений: «Ставка, Площадь». */
export function summarizeChanges(changes: TermChange[]): string {
  if (changes.length === 0) return "условия не изменены";
  return changes.map((c) => c.label).join(", ");
}
