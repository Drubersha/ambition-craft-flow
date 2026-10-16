/**
 * Движок импорта из 1С — чистая часть: сопоставление, план изменений, разнесение
 * платежей, сверка сальдо. Ничего не читает и не пишет в базу: получает «что есть»
 * (existing) и файл, возвращает план (что создать, обновить, привязать,
 * аннулировать) и отчёт. Запись делает import-1c.server.ts.
 *
 * Ключ записи — GUID 1С (external_id). При первой загрузке записи, заведённые
 * руками, привязываются к GUID по естественным ключам (ИНН, название, номер
 * договора, период+сумма начисления), чтобы не плодить дубли.
 */
import type {
  AmendmentIn,
  ChargeIn,
  ContractIn,
  Counterparty,
  ImportFile,
  PaymentIn,
  PropertyIn,
} from "./import-1c.schema";
import { monthKeysBetween, toISO } from "./format";

export type Row = Record<string, unknown>;

export type Existing = {
  tenants: Row[];
  properties: Row[];
  contracts: Row[];
  /** Все начисления владельца: нужны для FIFO-разнесения и сверки сальдо. */
  charges: Row[];
  /** Платежи владельца с external_id (для обновления/аннулирования) и все платежи по начислениям окна. */
  payments: Row[];
  tenantContacts: Row[];
};

export type Issue = { path: string; id?: string; reason: string };

export type Op = {
  table: "tenants" | "properties" | "contracts" | "charges" | "payments";
  action: "create" | "update" | "link" | "unchanged";
  /** Наш uuid: существующий или сгенерированный для новой записи. */
  id: string;
  externalId: string;
  /** Полная строка для create; для update/link — только изменённые поля. */
  row: Row;
  /** Прежние значения изменённых полей (для истории). */
  before?: Row;
};

export type VoidOp = {
  table: "charges" | "payments";
  id: string;
  externalId: string | null;
  row: Row;
  /** absent — документа нет в файле; cancelled — пришёл с is_cancelled; reallocated — лишняя строка разнесения. */
  reason: "absent" | "cancelled" | "reallocated";
};

/** Сколько документов файла пришлось на месяц окна — для проверки полноты выгрузки. */
export type CoverageMonth = {
  month: string;
  charges: number;
  charges_total: number;
  payments: number;
  payments_total: number;
};

/**
 * Защита от неполного файла: если в файле «пропало» слишком много ранее
 * загруженных документов окна, это почти наверняка выгрузка за один день
 * или с неверным `period`, а не массовое удаление в 1С. Запись без
 * подтверждения отклоняется.
 */
export type VoidGuard = {
  triggered: boolean;
  /** Документы окна, которых нет в файле (без явных is_cancelled и перераскладок). */
  absent: number;
  imported_in_window: number;
  limit_abs: number;
  limit_ratio: number;
  preview: {
    table: "charges" | "payments";
    external_id: string | null;
    number: string | null;
    date: string | null;
    amount: number;
  }[];
};

export const VOID_LIMIT_ABS = 10;
export const VOID_LIMIT_RATIO = 0.2;
/** Короче этого окно считается подозрительным для ежедневного файла (6 месяцев ≈ 182 дня). */
export const WINDOW_MIN_DAYS = 150;

export type Plan = {
  ops: Op[];
  contactsReplace: { tenantId: string; contacts: Row[] }[];
  voids: VoidOp[];
  coverage: CoverageMonth[];
  voidGuard: VoidGuard;
  skipped: Issue[];
  warnings: Issue[];
  balanceMismatches: {
    counterparty: string;
    contract: string | null;
    ours: number;
    theirs: number;
    diff: number;
  }[];
  touchedChargeIds: string[];
  counts: Record<
    string,
    {
      received: number;
      created: number;
      updated: number;
      linked: number;
      unchanged: number;
      voided: number;
    }
  >;
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_in: "Банковский перевод",
  cash_in: "Наличные",
  offset: "Взаимозачёт",
  return: "Возврат",
  adjustment: "Корректировка долга",
};

// ── утилиты ──────────────────────────────────────────────────────────────────

const EPS = 0.005;

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[«»"'“”„]/g, "")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function textOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function sameValue(a: unknown, b: unknown): boolean {
  const an = a === "" ? null : a;
  const bn = b === "" ? null : b;
  if (an === null || an === undefined) return bn === null || bn === undefined;
  if (bn === null || bn === undefined) return false;
  if (typeof an === "number" || typeof bn === "number") {
    const x = Number(an);
    const y = Number(bn);
    if (!Number.isNaN(x) && !Number.isNaN(y)) return Math.abs(x - y) < 0.0001;
  }
  if (typeof an === "boolean" || typeof bn === "boolean") return Boolean(an) === Boolean(bn);
  if (typeof an === "object" || typeof bn === "object")
    return JSON.stringify(an) === JSON.stringify(bn);
  return String(an) === String(bn);
}

/** Что изменилось: {patch, before} только по отличающимся полям. */
export function diffRow(existing: Row, target: Row): { patch: Row; before: Row } {
  const patch: Row = {};
  const before: Row = {};
  for (const [k, v] of Object.entries(target)) {
    if (!sameValue(existing[k], v)) {
      patch[k] = v;
      before[k] = existing[k] ?? null;
    }
  }
  return { patch, before };
}

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback (vitest на старом node): псевдо-uuid v4.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function lastDayOfMonth(y: number, m0: number): Date {
  return new Date(y, m0 + 1, 0);
}

/**
 * Срок оплаты начисления, если 1С его не передала: по дню и порядку оплаты
 * договора; без них — последний день следующего месяца (конвенция проекта).
 */
export function computeDueDate(
  contract: { payment_day?: number | null; payment_timing?: string | null } | null | undefined,
  periodStart: string,
  periodEnd: string,
): string {
  const ps = new Date(periodStart + "T00:00:00");
  const pe = new Date(periodEnd + "T00:00:00");
  const day = contract?.payment_day ?? null;
  const timing = contract?.payment_timing ?? null;
  if (day && timing) {
    let y = ps.getFullYear();
    let m = ps.getMonth();
    if (timing === "advance") m -= 1;
    if (timing === "arrears") {
      y = pe.getFullYear();
      m = pe.getMonth() + 1;
    }
    const base = new Date(y, m, 1);
    const last = lastDayOfMonth(base.getFullYear(), base.getMonth()).getDate();
    return toISO(new Date(base.getFullYear(), base.getMonth(), Math.min(day, last)));
  }
  return toISO(lastDayOfMonth(pe.getFullYear(), pe.getMonth() + 1));
}

// ── маппинг файла в строки таблиц ────────────────────────────────────────────

export function tenantRow(cp: Counterparty): Row {
  const first = cp.contacts[0];
  return {
    external_id: cp.id,
    name: cp.name,
    kind: cp.kind === "person" ? "person" : "company",
    country: cp.country,
    inn: textOrNull(cp.inn),
    kpp: textOrNull(cp.kpp),
    ogrn: textOrNull(cp.ogrn),
    foreign_tax_id: textOrNull(cp.foreign_tax_id),
    legal_address: textOrNull(cp.legal_address),
    actual_address: textOrNull(cp.actual_address),
    postal_address: textOrNull(cp.postal_address),
    bank_name: textOrNull(cp.bank?.name),
    bank_bik: textOrNull(cp.bank?.bik),
    bank_account: textOrNull(cp.bank?.account),
    bank_corr_account: textOrNull(cp.bank?.corr_account),
    signatory_name: textOrNull(cp.signatory?.name),
    signatory_position: textOrNull(cp.signatory?.position),
    signatory_basis: textOrNull(cp.signatory?.basis),
    contact_person: textOrNull(first?.name),
    phone: textOrNull(first?.phone),
    email: textOrNull(first?.email),
  };
}

export function propertyRow(p: PropertyIn): Row {
  return {
    external_id: p.id,
    name: p.name,
    address: p.address,
    cadastral_no: textOrNull(p.cadastral_no),
    type: p.type,
    unit: p.unit,
    area_total: p.area_total,
    area_usable: p.area_usable ?? null,
    floor: textOrNull(p.floor),
    room_no: textOrNull(p.room_no),
  };
}

export function contractRow(c: ContractIn, tenantId: string, propertyId: string): Row {
  return {
    external_id: c.id,
    number: c.number || null,
    signed_date: c.date,
    tenant_id: tenantId,
    property_id: propertyId,
    kind: c.kind === "own_use" ? "ahch" : "rent",
    status: c.status,
    start_date: c.start_date,
    end_date: c.end_date ?? null,
    handover_date: c.handover_date ?? null,
    unit: c.unit,
    area: c.area ?? null,
    rate: c.rate,
    payment_period: c.rate_period,
    currency: c.currency,
    vat_rate: c.vat_rate ?? null,
    vat_included: c.vat_included,
    payment_day: c.payment_day ?? null,
    payment_timing: c.payment_timing ?? null,
    has_variable_part: c.variable_part?.enabled ?? false,
    variable_payment_day: c.variable_part?.payment_day ?? null,
    variable_part_note: textOrNull(c.variable_part?.note),
    deposit_percent: c.deposit?.percent ?? null,
    deposit_amount: c.deposit?.amount ?? null,
    deposit_paid_at: c.deposit?.paid_at ?? null,
    penalty_percent_per_day: c.penalty_percent_per_day ?? null,
    auto_renew: c.auto_renew,
    renew_months: c.renew_months ?? null,
    termination_notice_days: c.termination_notice_days ?? null,
  };
}

/** Допсоглашение: копия действующих условий родителя + то, что меняет допник. */
export function amendmentRow(a: AmendmentIn, parent: Row, parentId: string): Row {
  const ch = a.changes ?? {};
  const subject = [textOrNull(a.subject), textOrNull(ch.other)].filter(Boolean).join("; ") || null;
  return {
    external_id: a.id,
    parent_contract_id: parentId,
    number: a.number || null,
    signed_date: a.date,
    tenant_id: parent.tenant_id,
    property_id: parent.property_id,
    kind: parent.kind ?? "rent",
    status: "active",
    start_date: a.effective_from,
    end_date:
      ch.end_date !== undefined && ch.end_date !== null ? ch.end_date : (parent.end_date ?? null),
    unit: parent.unit ?? "sqm",
    area: ch.area ?? parent.area ?? null,
    rate: ch.rate ?? parent.rate ?? 0,
    payment_period: parent.payment_period ?? "monthly",
    currency: parent.currency ?? "RUB",
    vat_rate: ch.vat_rate ?? parent.vat_rate ?? null,
    vat_included: parent.vat_included ?? true,
    payment_day: ch.payment_day ?? parent.payment_day ?? null,
    payment_timing: parent.payment_timing ?? null,
    amendment_subject: subject,
  };
}

export function chargeRow(ch: ChargeIn, contractId: string, contract: Row | null): Row {
  return {
    external_id: ch.id,
    contract_id: contractId,
    period_start: ch.period_from,
    period_end: ch.period_to,
    due_date: ch.due_date ?? computeDueDate(contract as never, ch.period_from, ch.period_to),
    total: ch.amount_total,
    amount_without_vat: ch.amount_without_vat,
    vat_amount: ch.vat_amount,
    doc_number: ch.number,
    doc_date: ch.date,
    kind: ch.kind,
    notes: textOrNull(ch.description),
  };
}

export function paymentRow(p: PaymentIn, index: number, chargeId: string, amount: number): Row {
  const parts = [textOrNull(p.purpose)];
  if (p.doc_type === "offset" && p.offset) parts.push(`Зачёт: ${p.offset.description}`);
  return {
    external_id: p.id,
    allocation_index: index,
    charge_id: chargeId,
    paid_at: p.date,
    amount,
    method: PAYMENT_METHOD_LABELS[p.doc_type] ?? p.doc_type,
    doc_type: p.doc_type,
    doc_number: p.number,
    comment: parts.filter(Boolean).join(" · ") || null,
    offset_info: p.offset ?? null,
  };
}

// ── план ─────────────────────────────────────────────────────────────────────

function emptyCounts() {
  return { received: 0, created: 0, updated: 0, linked: 0, unchanged: 0, voided: 0 };
}

type Ctx = {
  ownerId: string;
  file: ImportFile;
  existing: Existing;
  plan: Plan;
  /** GUID → наш id для каждой сущности. */
  tenantIds: Map<string, string>;
  propertyIds: Map<string, string>;
  contractIds: Map<string, string>;
  chargeIds: Map<string, string>;
  /** Планируемое состояние начислений: id → {contract_id, period_start, total, paid}. */
  chargeState: Map<
    string,
    { contractId: string; periodStart: string; total: number; paid: number }
  >;
  /** Строки договоров (целевые), чтобы допники и сроки оплаты брали актуальные условия. */
  contractRows: Map<string, Row>;
};

function registerOp(ctx: Ctx, op: Op) {
  const c = ctx.plan.counts[op.table];
  if (op.action === "create") c.created++;
  else if (op.action === "update") c.updated++;
  else if (op.action === "link") c.linked++;
  else c.unchanged++;
  if (op.action !== "unchanged") ctx.plan.ops.push(op);
}

/**
 * Общий шаг «найти или создать»: по external_id, иначе по естественному ключу
 * (только если кандидат ровно один), иначе новая запись.
 */
function upsertRow(
  ctx: Ctx,
  table: Op["table"],
  externalId: string,
  target: Row,
  natural: (r: Row) => boolean,
  rows: Row[],
  opts: { preserve?: (existing: Row, patch: Row) => void } = {},
): Op {
  const byExt = rows.find((r) => r.external_id === externalId);
  let existing = byExt ?? null;
  let linked = false;
  if (!existing) {
    const candidates = rows.filter((r) => !r.external_id && natural(r));
    if (candidates.length === 1) {
      existing = candidates[0];
      linked = true;
    } else if (candidates.length > 1) {
      ctx.plan.warnings.push({
        path: table,
        id: externalId,
        reason: `несколько похожих записей без GUID (${candidates.length}) — создана новая, объедините вручную`,
      });
    }
  }
  if (existing) {
    const { patch, before } = diffRow(existing, target);
    opts.preserve?.(existing, patch);
    for (const k of Object.keys(before)) if (!(k in patch)) delete before[k];
    const id = String(existing.id);
    if (Object.keys(patch).length === 0) {
      const op: Op = { table, action: "unchanged", id, externalId, row: {} };
      registerOp(ctx, op);
      return op;
    }
    const op: Op = {
      table,
      action: linked ? "link" : "update",
      id,
      externalId,
      row: patch,
      before,
    };
    registerOp(ctx, op);
    return op;
  }
  const id = newId();
  const op: Op = {
    table,
    action: "create",
    id,
    externalId,
    row: { ...target, id, owner_id: ctx.ownerId },
  };
  registerOp(ctx, op);
  return op;
}

function planTenants(ctx: Ctx) {
  const { file, existing } = ctx;
  ctx.plan.counts.tenants.received = file.counterparties.length;
  for (const cp of file.counterparties) {
    const target = tenantRow(cp);
    const inn = textOrNull(cp.inn);
    const op = upsertRow(
      ctx,
      "tenants",
      cp.id,
      target,
      (r) => (inn ? textOrNull(r.inn) === inn : false) || norm(r.name) === norm(cp.name),
      existing.tenants,
      {
        // Пользовательскую классификацию (своя компания, друзья) из 1С не затираем.
        preserve: (ex, patch) => {
          if (ex.kind === "own_company" || ex.kind === "owner_friends") delete patch.kind;
        },
      },
    );
    ctx.tenantIds.set(cp.id, op.id);
    // Контактные лица: заменяем набор целиком, если 1С их передала.
    if (cp.contacts.length > 0) {
      const current = existing.tenantContacts
        .filter((c) => c.tenant_id === op.id)
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        .map((c) => ({ full_name: c.full_name, email: c.email ?? null, phone: c.phone ?? null }));
      const next = cp.contacts.map((c) => ({
        full_name: c.name,
        email: textOrNull(c.email),
        phone: textOrNull(c.phone),
      }));
      if (JSON.stringify(current) !== JSON.stringify(next)) {
        ctx.plan.contactsReplace.push({
          tenantId: op.id,
          contacts: next.map((c, i) => ({
            ...c,
            sort_order: i,
            tenant_id: op.id,
            owner_id: ctx.ownerId,
          })),
        });
      }
    }
  }
}

function planProperties(ctx: Ctx) {
  const { file, existing } = ctx;
  ctx.plan.counts.properties.received = file.properties.length;
  for (const p of file.properties) {
    const target = propertyRow(p);
    const op = upsertRow(
      ctx,
      "properties",
      p.id,
      target,
      (r) => norm(r.name) === norm(p.name),
      existing.properties,
    );
    if (op.action === "create") op.row.status = p.own_use ? "ahch" : "free";
    ctx.propertyIds.set(p.id, op.id);
  }
}

function planContracts(ctx: Ctx) {
  const { file, existing } = ctx;
  const main = existing.contracts.filter((c) => !c.parent_contract_id);
  ctx.plan.counts.contracts.received = file.contracts.length;
  for (const c of file.contracts) {
    const tenantId = ctx.tenantIds.get(c.counterparty_id);
    if (!tenantId) {
      ctx.plan.skipped.push({ path: "contracts", id: c.id, reason: "контрагент не найден" });
      continue;
    }
    const byExt = main.find((r) => r.external_id === c.id);
    const natural = main.filter(
      (r) => !r.external_id && r.tenant_id === tenantId && norm(r.number) === norm(c.number),
    );
    const known = byExt ?? (natural.length === 1 ? natural[0] : null);
    let propertyId = c.property_id ? ctx.propertyIds.get(c.property_id) : undefined;
    if (!propertyId && known) propertyId = String(known.property_id);
    if (!propertyId) {
      ctx.plan.skipped.push({
        path: "contracts",
        id: c.id,
        reason: `№ ${c.number}: не указан объект, а в программе такого договора ещё нет — заведите объект или передайте property_id`,
      });
      continue;
    }
    const target = contractRow(c, tenantId, propertyId);
    const op = upsertRow(
      ctx,
      "contracts",
      c.id,
      target,
      (r) => r.tenant_id === tenantId && norm(r.number) === norm(c.number),
      main,
    );
    ctx.contractIds.set(c.id, op.id);
    ctx.contractRows.set(op.id, known ? { ...known, ...target } : target);
  }
}

function planAmendments(ctx: Ctx) {
  const { file, existing } = ctx;
  const amendments = existing.contracts.filter((c) => c.parent_contract_id);
  // Допники считаются вместе с договорами (одна таблица), но ведём отдельный приход.
  for (const a of file.amendments) {
    const parentId =
      ctx.contractIds.get(a.contract_id) ??
      existing.contracts.find((c) => c.external_id === a.contract_id)?.id;
    const parent = parentId
      ? (ctx.contractRows.get(String(parentId)) ??
        existing.contracts.find((c) => c.id === parentId))
      : null;
    if (!parentId || !parent) {
      ctx.plan.skipped.push({ path: "amendments", id: a.id, reason: "основной договор не найден" });
      continue;
    }
    const target = amendmentRow(a, parent, String(parentId));
    upsertRow(
      ctx,
      "contracts",
      a.id,
      target,
      (r) => r.parent_contract_id === parentId && norm(r.number) === norm(a.number),
      amendments,
    );
  }
}

function inWindow(date: unknown, from: string, to: string): boolean {
  const d = String(date ?? "").slice(0, 10);
  return d >= from && d <= to;
}

function planCharges(ctx: Ctx) {
  const { file, existing } = ctx;
  ctx.plan.counts.charges.received = file.charges.length;
  // Текущее состояние всех начислений владельца — база для FIFO и сальдо.
  for (const r of existing.charges) {
    ctx.chargeState.set(String(r.id), {
      contractId: String(r.contract_id),
      periodStart: String(r.period_start),
      total: Number(r.total),
      paid: Number(r.paid_total ?? 0),
    });
    if (r.external_id) ctx.chargeIds.set(String(r.external_id), String(r.id));
  }
  const fileIds = new Set<string>();
  for (const ch of file.charges) {
    fileIds.add(ch.id);
    const contractId = ctx.contractIds.get(ch.contract_id);
    if (!contractId) {
      ctx.plan.skipped.push({
        path: "charges",
        id: ch.id,
        reason: `${ch.number}: договор не найден`,
      });
      continue;
    }
    if (ch.is_cancelled) {
      const ex = existing.charges.find((r) => r.external_id === ch.id);
      if (ex)
        ctx.plan.voids.push({
          table: "charges",
          id: String(ex.id),
          externalId: ch.id,
          row: ex,
          reason: "cancelled",
        });
      continue;
    }
    const contract =
      ctx.contractRows.get(contractId) ??
      existing.contracts.find((c) => c.id === contractId) ??
      null;
    const target = chargeRow(ch, contractId, contract);
    const op = upsertRow(
      ctx,
      "charges",
      ch.id,
      target,
      (r) =>
        r.contract_id === contractId &&
        String(r.period_start) === ch.period_from &&
        String(r.period_end) === ch.period_to &&
        Math.abs(Number(r.total) - ch.amount_total) < EPS,
      existing.charges,
    );
    ctx.chargeIds.set(ch.id, op.id);
    const prev = ctx.chargeState.get(op.id);
    ctx.chargeState.set(op.id, {
      contractId,
      periodStart: ch.period_from,
      total: ch.amount_total,
      paid: prev?.paid ?? 0,
    });
    if (op.action !== "unchanged") ctx.plan.touchedChargeIds.push(op.id);
  }
  // Исчезнувшие из окна документы 1С — аннулировать.
  const { from, to } = file.period;
  for (const r of existing.charges) {
    if (!r.external_id || fileIds.has(String(r.external_id))) continue;
    const docDate = r.doc_date ?? r.period_end;
    if (!inWindow(docDate, from, to) && file.mode !== "full") continue;
    ctx.plan.voids.push({
      table: "charges",
      id: String(r.id),
      externalId: String(r.external_id),
      row: r,
      reason: "absent",
    });
    ctx.chargeState.delete(String(r.id));
  }
}

/** Разнесение платежа: явные allocations или FIFO по начислениям договора/контрагента. */
export function allocatePayment(
  amount: number,
  explicit: { chargeId: string; amount: number }[],
  candidates: { id: string; periodStart: string; remaining: number }[],
): { chargeId: string; amount: number }[] {
  if (explicit.length > 0) return explicit.filter((a) => Math.abs(a.amount) >= EPS);
  const sorted = [...candidates].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const out: { chargeId: string; amount: number }[] = [];
  let left = amount;
  for (const c of sorted) {
    if (left < EPS) break;
    if (c.remaining < EPS) continue;
    const take = Math.min(c.remaining, left);
    out.push({ chargeId: c.id, amount: Math.round(take * 100) / 100 });
    left = Math.round((left - take) * 100) / 100;
  }
  if (left >= EPS && sorted.length > 0) {
    // Сверх начислений — авансом на последнее (конвенция проекта).
    const last = sorted[sorted.length - 1];
    const idx = out.findIndex((o) => o.chargeId === last.id);
    if (idx >= 0) out[idx].amount = Math.round((out[idx].amount + left) * 100) / 100;
    else out.push({ chargeId: last.id, amount: left });
  }
  return out;
}

function planPayments(ctx: Ctx) {
  const { file, existing } = ctx;
  ctx.plan.counts.payments.received = file.payments.length;
  const imported = existing.payments.filter((p) => p.external_id);
  const fileKeys = new Set<string>();
  // Платежи, которые будут обновлены/аннулированы, вычитаем из «оплачено» заранее.
  const oldByExt = new Map<string, Row[]>();
  for (const p of imported) {
    const arr = oldByExt.get(String(p.external_id)) ?? [];
    arr.push(p);
    oldByExt.set(String(p.external_id), arr);
  }
  const subtractOld = (ext: string) => {
    for (const old of oldByExt.get(ext) ?? []) {
      const st = ctx.chargeState.get(String(old.charge_id));
      if (st) st.paid = Math.round((st.paid - Number(old.amount)) * 100) / 100;
    }
  };

  for (const p of file.payments) {
    const oldRows = oldByExt.get(p.id) ?? [];
    if (p.is_cancelled) {
      for (const old of oldRows) {
        ctx.plan.voids.push({
          table: "payments",
          id: String(old.id),
          externalId: p.id,
          row: old,
          reason: "cancelled",
        });
        const st = ctx.chargeState.get(String(old.charge_id));
        if (st) st.paid = Math.round((st.paid - Number(old.amount)) * 100) / 100;
        ctx.plan.touchedChargeIds.push(String(old.charge_id));
      }
      continue;
    }
    subtractOld(p.id);
    const tenantId = ctx.tenantIds.get(p.counterparty_id);
    const contractId = p.contract_id ? ctx.contractIds.get(p.contract_id) : undefined;
    const explicit = p.allocations
      .map((a) => ({ chargeId: ctx.chargeIds.get(a.charge_id) ?? "", amount: a.amount }))
      .filter((a) => a.chargeId);
    if (p.allocations.length > 0 && explicit.length !== p.allocations.length) {
      ctx.plan.skipped.push({
        path: "payments",
        id: p.id,
        reason: `${p.number}: начисление из allocations не найдено`,
      });
      continue;
    }
    let candidates: { id: string; periodStart: string; remaining: number }[] = [];
    if (explicit.length === 0) {
      const contractIds = contractId
        ? [contractId]
        : existing.contracts
            .filter((c) => c.tenant_id === tenantId && !c.parent_contract_id)
            .map((c) => String(c.id))
            .concat(
              [...ctx.contractRows.entries()]
                .filter(([, r]) => r.tenant_id === tenantId)
                .map(([id]) => id),
            );
      const set = new Set(contractIds);
      candidates = [...ctx.chargeState.entries()]
        .filter(([, s]) => set.has(s.contractId))
        .map(([id, s]) => ({
          id,
          periodStart: s.periodStart,
          remaining: Math.round((s.total - s.paid) * 100) / 100,
        }));
      if (candidates.length === 0) {
        ctx.plan.skipped.push({
          path: "payments",
          id: p.id,
          reason: `${p.number}: нет начислений, к которым привязать платёж`,
        });
        continue;
      }
    }
    const parts = allocatePayment(p.amount, explicit, candidates);
    parts.forEach((part, i) => {
      const key = `${p.id}#${i}`;
      fileKeys.add(key);
      const target = paymentRow(p, i, part.chargeId, part.amount);
      const op = upsertRow(
        ctx,
        "payments",
        p.id,
        target,
        (r) =>
          r.charge_id === part.chargeId &&
          String(r.paid_at) === p.date &&
          Math.abs(Number(r.amount) - part.amount) < EPS,
        existing.payments.filter(
          (r) => !r.external_id || (r.external_id === p.id && Number(r.allocation_index) === i),
        ),
      );
      // upsertRow ищет по external_id без индекса — уточняем вручную для i>0.
      if (op.action === "create") op.row.allocation_index = i;
      const st = ctx.chargeState.get(part.chargeId);
      if (st) st.paid = Math.round((st.paid + part.amount) * 100) / 100;
      ctx.plan.touchedChargeIds.push(part.chargeId);
    });
    // Лишние строки разнесения (allocations стали короче) — аннулировать.
    for (const old of oldRows) {
      if (Number(old.allocation_index) >= parts.length) {
        ctx.plan.voids.push({
          table: "payments",
          id: String(old.id),
          externalId: p.id,
          row: old,
          reason: "reallocated",
        });
        ctx.plan.touchedChargeIds.push(String(old.charge_id));
      }
    }
  }
  const { from, to } = file.period;
  const fileIds = new Set(file.payments.map((p) => p.id));
  for (const r of imported) {
    if (fileIds.has(String(r.external_id))) continue;
    if (!inWindow(r.paid_at, from, to) && file.mode !== "full") continue;
    ctx.plan.voids.push({
      table: "payments",
      id: String(r.id),
      externalId: String(r.external_id),
      row: r,
      reason: "absent",
    });
    const st = ctx.chargeState.get(String(r.charge_id));
    if (st) st.paid = Math.round((st.paid - Number(r.amount)) * 100) / 100;
    ctx.plan.touchedChargeIds.push(String(r.charge_id));
  }
}

function planBalances(ctx: Ctx) {
  const { file, existing } = ctx;
  if (file.balances.length === 0) return;
  // Наш долг по договору = Σ(total − paid) по начислениям с положительным остатком.
  const debtByContract = new Map<string, number>();
  for (const [, s] of ctx.chargeState) {
    const rem = Math.round((s.total - s.paid) * 100) / 100;
    debtByContract.set(
      s.contractId,
      Math.round(((debtByContract.get(s.contractId) ?? 0) + rem) * 100) / 100,
    );
  }
  const contractTenant = new Map<string, string>();
  for (const c of existing.contracts) contractTenant.set(String(c.id), String(c.tenant_id));
  for (const [id, r] of ctx.contractRows) contractTenant.set(id, String(r.tenant_id));
  for (const b of file.balances) {
    const theirs = Math.round((b.debit - b.credit) * 100) / 100;
    let ours = 0;
    if (b.contract_id) {
      const cid = ctx.contractIds.get(b.contract_id);
      if (!cid) continue;
      ours = debtByContract.get(cid) ?? 0;
    } else {
      const tid = ctx.tenantIds.get(b.counterparty_id);
      if (!tid) continue;
      for (const [cid, d] of debtByContract) if (contractTenant.get(cid) === tid) ours += d;
    }
    ours = Math.round(ours * 100) / 100;
    if (Math.abs(ours - theirs) > 0.01) {
      const cp = file.counterparties.find((c) => c.id === b.counterparty_id);
      const ct = b.contract_id ? file.contracts.find((c) => c.id === b.contract_id) : null;
      ctx.plan.balanceMismatches.push({
        counterparty: cp?.name ?? b.counterparty_id,
        contract: ct?.number ?? null,
        ours,
        theirs,
        diff: Math.round((ours - theirs) * 100) / 100,
      });
    }
  }
}

/** Документы файла по месяцам окна: по этой таблице видно, полная ли выгрузка. */
export function computeCoverage(file: ImportFile): CoverageMonth[] {
  const rows = new Map<string, CoverageMonth>();
  const localDate = (iso: string) => new Date(iso + "T00:00:00");
  for (const month of monthKeysBetween(localDate(file.period.from), localDate(file.period.to)))
    rows.set(month, { month, charges: 0, charges_total: 0, payments: 0, payments_total: 0 });
  const bump = (date: string, kind: "charges" | "payments", amount: number) => {
    const r = rows.get(date.slice(0, 7));
    if (!r) return;
    r[kind] += 1;
    const total = kind === "charges" ? "charges_total" : "payments_total";
    r[total] = Math.round((r[total] + amount) * 100) / 100;
  };
  for (const c of file.charges) if (!c.is_cancelled) bump(c.date, "charges", c.amount_total);
  for (const p of file.payments) if (!p.is_cancelled) bump(p.date, "payments", p.amount);
  return [...rows.values()];
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Сработает, если «пропавших» документов больше VOID_LIMIT_ABS или больше VOID_LIMIT_RATIO от загруженных в окне. */
export function voidGuard(plan: Plan, existing: Existing, file: ImportFile): VoidGuard {
  const { from, to } = file.period;
  const all = file.mode === "full";
  const importedInWindow =
    existing.charges.filter(
      (r) => r.external_id && (all || inWindow(r.doc_date ?? r.period_end, from, to)),
    ).length +
    existing.payments.filter((r) => r.external_id && (all || inWindow(r.paid_at, from, to))).length;
  const absentOps = plan.voids.filter((v) => v.reason === "absent");
  const absent = absentOps.length;
  const triggered =
    absent > 0 && (absent >= VOID_LIMIT_ABS || absent >= importedInWindow * VOID_LIMIT_RATIO);
  return {
    triggered,
    absent,
    imported_in_window: importedInWindow,
    limit_abs: VOID_LIMIT_ABS,
    limit_ratio: VOID_LIMIT_RATIO,
    preview: absentOps.slice(0, 50).map((v) => ({
      table: v.table,
      external_id: v.externalId,
      number: textOrNull(v.row.doc_number),
      date:
        v.table === "charges"
          ? textOrNull(v.row.doc_date ?? v.row.period_end)
          : textOrNull(v.row.paid_at),
      amount: Number(v.table === "charges" ? v.row.total : v.row.amount) || 0,
    })),
  };
}

function planCompleteness(ctx: Ctx) {
  const { file, plan, existing } = ctx;
  plan.coverage = computeCoverage(file);
  const span = daysBetween(file.period.from, file.period.to);
  if (file.mode === "window" && span < WINDOW_MIN_DAYS)
    plan.warnings.push({
      path: "period",
      reason: `окно ${span} дн. короче согласованных 6 месяцев: аннулирование ограничено этим окном, документы вне него не тронуты`,
    });
  for (const m of plan.coverage)
    if (m.charges === 0 && m.payments === 0)
      plan.warnings.push({
        path: "period",
        reason: `за ${m.month} в файле нет ни начислений, ни оплат — проверьте полноту выгрузки`,
      });
  plan.voidGuard = voidGuard(plan, existing, file);
  const g = plan.voidGuard;
  if (g.triggered)
    plan.warnings.push({
      path: "period",
      reason: `в файле нет ${g.absent} из ${g.imported_in_window} ранее загруженных документов окна (порог: ${g.limit_abs} шт. или ${Math.round(g.limit_ratio * 100)} %) — похоже на неполную выгрузку; запись без ?confirm_voids=1 будет отклонена`,
    });
}

export function buildPlan(ownerId: string, file: ImportFile, existing: Existing): Plan {
  const plan: Plan = {
    ops: [],
    contactsReplace: [],
    voids: [],
    coverage: [],
    voidGuard: {
      triggered: false,
      absent: 0,
      imported_in_window: 0,
      limit_abs: VOID_LIMIT_ABS,
      limit_ratio: VOID_LIMIT_RATIO,
      preview: [],
    },
    skipped: [],
    warnings: [],
    balanceMismatches: [],
    touchedChargeIds: [],
    counts: {
      tenants: emptyCounts(),
      properties: emptyCounts(),
      contracts: emptyCounts(),
      charges: emptyCounts(),
      payments: emptyCounts(),
    },
  };
  const ctx: Ctx = {
    ownerId,
    file,
    existing,
    plan,
    tenantIds: new Map(),
    propertyIds: new Map(),
    contractIds: new Map(),
    chargeIds: new Map(),
    chargeState: new Map(),
    contractRows: new Map(),
  };
  // Уже известные приёмнику GUID договоров/объектов (из прошлых пакетов).
  for (const r of existing.contracts)
    if (r.external_id && !r.parent_contract_id)
      ctx.contractIds.set(String(r.external_id), String(r.id));
  for (const r of existing.properties)
    if (r.external_id) ctx.propertyIds.set(String(r.external_id), String(r.id));
  for (const r of existing.tenants)
    if (r.external_id) ctx.tenantIds.set(String(r.external_id), String(r.id));

  planTenants(ctx);
  planProperties(ctx);
  planContracts(ctx);
  planAmendments(ctx);
  planCharges(ctx);
  planPayments(ctx);
  planBalances(ctx);
  planCompleteness(ctx);

  for (const v of plan.voids) plan.counts[v.table].voided++;
  plan.touchedChargeIds = [...new Set(plan.touchedChargeIds)];
  return plan;
}

/** Сводка для ответа приёмника и для журнала. */
export function planReport(plan: Plan) {
  return {
    counts: plan.counts,
    coverage: plan.coverage,
    void_guard: plan.voidGuard,
    skipped: plan.skipped,
    warnings: plan.warnings,
    balance_mismatches: plan.balanceMismatches,
    changes: plan.ops.length + plan.voids.length + plan.contactsReplace.length,
  };
}
