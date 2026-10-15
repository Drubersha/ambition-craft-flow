/**
 * Серверная часть приёмника 1С: токены, чтение текущего состояния, применение
 * плана с историей и журналом пакетов. Только для серверных маршрутов и
 * server-функций (service-role, минуя RLS — владелец берётся из токена).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import type { Existing, Plan, Row, VoidOp } from "./import-1c";
import { buildPlan, planReport } from "./import-1c";
import {
  findDanglingRefs,
  formatSchemaErrors,
  ImportFileSchema,
  type ImportFile,
} from "./import-1c.schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sb = SupabaseClient<any, "public", any>;

let _raw: Sb | undefined;
/** Нетипизированный service-клиент: типы Database не знают новых таблиц импорта. */
export function adminRaw(): Sb {
  if (_raw) return _raw;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не заданы");
  _raw = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _raw;
}

// ── токены ───────────────────────────────────────────────────────────────────

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateToken(): string {
  return "lp1c_" + randomBytes(32).toString("base64url");
}

export type TokenInfo = { id: string; ownerId: string; allowedIps: string[]; label: string };

export async function authenticateToken(sb: Sb, bearer: string | null): Promise<TokenInfo | null> {
  if (!bearer || !bearer.startsWith("Bearer ")) return null;
  const token = bearer.slice(7).trim();
  if (!token) return null;
  const { data } = await sb
    .from("import_tokens")
    .select("id, owner_id, allowed_ips, label, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  await sb
    .from("import_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return {
    id: data.id,
    ownerId: data.owner_id,
    allowedIps: data.allowed_ips ?? [],
    label: data.label,
  };
}

export function ipAllowed(allowed: string[], ip: string | null): boolean {
  if (allowed.length === 0) return true;
  if (!ip) return false;
  return allowed.includes(ip);
}

// ── чтение текущего состояния ────────────────────────────────────────────────

/** PostgREST отдаёт максимум 1000 строк за запрос — читаем страницами. */
async function selectAll(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function loadExisting(
  sb: Sb,
  ownerId: string,
  window: { from: string; to: string },
): Promise<Existing> {
  const [tenants, properties, contracts, charges, payments, tenantContacts] = await Promise.all([
    selectAll((a, b) =>
      sb.from("tenants").select("*").eq("owner_id", ownerId).order("id").range(a, b),
    ),
    selectAll((a, b) =>
      sb.from("properties").select("*").eq("owner_id", ownerId).order("id").range(a, b),
    ),
    selectAll((a, b) =>
      sb.from("contracts").select("*").eq("owner_id", ownerId).order("id").range(a, b),
    ),
    selectAll((a, b) =>
      sb
        .from("charges")
        .select(
          "id, contract_id, period_start, period_end, due_date, total, paid_total, status, external_id, doc_date, doc_number, kind, amount_without_vat, vat_amount, notes",
        )
        .eq("owner_id", ownerId)
        .order("id")
        .range(a, b),
    ),
    selectAll((a, b) =>
      sb
        .from("payments")
        .select("*")
        .eq("owner_id", ownerId)
        .or(`external_id.not.is.null,paid_at.gte.${window.from}`)
        .order("id")
        .range(a, b),
    ),
    selectAll((a, b) =>
      sb
        .from("tenant_contacts")
        .select("id, tenant_id, full_name, email, phone, sort_order")
        .eq("owner_id", ownerId)
        .order("id")
        .range(a, b),
    ),
  ]);
  return { tenants, properties, contracts, charges, payments, tenantContacts };
}

// ── применение плана ─────────────────────────────────────────────────────────

type HistoryRow = {
  batch_id: string;
  owner_id: string;
  table_name: string;
  record_id: string | null;
  external_id: string | null;
  action: string;
  before: Row | null;
  after: Row | null;
};

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function must<T extends { error: { message: string } | null }>(
  label: string,
  p: PromiseLike<T>,
): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return r;
}

/**
 * Пишет план в базу в порядке зависимостей: арендаторы → контакты → объекты →
 * договоры (основные, затем допники) → начисления → платежи → аннулирования →
 * пересчёт начислений → история. Транзакции нет (PostgREST), поэтому при сбое
 * пакет помечается failed; повторная отправка того же файла идемпотентна.
 */
export async function applyPlan(
  sb: Sb,
  ownerId: string,
  batchId: string,
  plan: Plan,
): Promise<void> {
  const history: HistoryRow[] = [];
  const hist = (
    table: string,
    recordId: string | null,
    externalId: string | null,
    action: string,
    before: Row | null,
    after: Row | null,
  ) =>
    history.push({
      batch_id: batchId,
      owner_id: ownerId,
      table_name: table,
      record_id: recordId,
      external_id: externalId,
      action,
      before,
      after,
    });

  // Группы подряд идущих операций одной таблицы: create пачкой, update по одной.
  let i = 0;
  while (i < plan.ops.length) {
    const table = plan.ops[i].table;
    const group: typeof plan.ops = [];
    while (i < plan.ops.length && plan.ops[i].table === table) group.push(plan.ops[i++]);
    const creates = group.filter((o) => o.action === "create");
    for (const part of chunks(creates, 200)) {
      await must(`insert ${table}`, sb.from(table).insert(part.map((o) => o.row)));
      for (const o of part) hist(table, o.id, o.externalId, "create", null, o.row);
    }
    for (const o of group.filter((g) => g.action === "update" || g.action === "link")) {
      await must(`update ${table} ${o.id}`, sb.from(table).update(o.row).eq("id", o.id));
      hist(table, o.id, o.externalId, o.action, o.before ?? null, o.row);
    }
    // Контакты арендаторов — сразу после арендаторов (ссылаются на их id).
    if (table === "tenants") {
      for (const c of plan.contactsReplace) {
        await must(
          "delete tenant_contacts",
          sb.from("tenant_contacts").delete().eq("tenant_id", c.tenantId),
        );
        if (c.contacts.length > 0)
          await must("insert tenant_contacts", sb.from("tenant_contacts").insert(c.contacts));
        hist("tenant_contacts", c.tenantId, null, "update", null, { contacts: c.contacts });
      }
    }
  }

  // Аннулирование: снимок строки в историю, затем удаление из рабочей таблицы.
  const voidPayments = plan.voids.filter((v) => v.table === "payments");
  const voidCharges = plan.voids.filter((v) => v.table === "charges");
  const touched = new Set(plan.touchedChargeIds);
  const voidRows = async (v: VoidOp[]) => {
    for (const part of chunks(v, 200)) {
      await must(
        `delete ${part[0].table}`,
        sb
          .from(part[0].table)
          .delete()
          .in(
            "id",
            part.map((x) => x.id),
          ),
      );
      for (const x of part) hist(x.table, x.id, x.externalId, "void", x.row, null);
    }
  };
  if (voidPayments.length) {
    for (const v of voidPayments) touched.add(String(v.row.charge_id));
    await voidRows(voidPayments);
  }
  if (voidCharges.length) {
    // Платежи удаляемых начислений уйдут каскадом — сохраняем их снимки.
    const ids = voidCharges.map((v) => v.id);
    const { data: cascaded } = await sb.from("payments").select("*").in("charge_id", ids);
    for (const p of cascaded ?? [])
      hist("payments", String(p.id), (p.external_id as string) ?? null, "void", p, null);
    await voidRows(voidCharges);
    for (const v of voidCharges) touched.delete(v.id);
  }

  // Статусы начислений: триггер платежей считает paid_total, overdue — по сроку.
  const ids = [...touched];
  for (const part of chunks(ids, 300)) {
    const { error } = await sb.rpc("recalc_charges", { _ids: part });
    if (error) throw new Error(`recalc_charges: ${error.message}`);
  }

  for (const part of chunks(history, 500)) {
    await must("insert import_history", sb.from("import_history").insert(part));
  }
}

// ── полный прогон одного файла ───────────────────────────────────────────────

export type RunResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Проверка → план → (запись) → отчёт. Журнал пакета ведётся всегда, в том числе
 * для отклонённых файлов и dry_run: ИТ-директору видно, что именно не прошло.
 */
export async function runImport(opts: {
  sb: Sb;
  ownerId: string;
  tokenId: string | null;
  raw: unknown;
  fileSize: number;
  fileHash: string;
  dryRun: boolean;
}): Promise<RunResult> {
  const { sb, ownerId } = opts;
  const started = Date.now();
  const batchInsert = await sb
    .from("import_batches")
    .insert({
      owner_id: ownerId,
      token_id: opts.tokenId,
      dry_run: opts.dryRun,
      status: "running",
      file_hash: opts.fileHash,
      file_size: opts.fileSize,
    })
    .select("id")
    .single();
  if (batchInsert.error) throw new Error(`import_batches: ${batchInsert.error.message}`);
  const batchId = String(batchInsert.data.id);
  const finish = async (status: string, patch: Row) =>
    sb
      .from("import_batches")
      .update({ status, duration_ms: Date.now() - started, ...patch })
      .eq("id", batchId);

  const parsed = ImportFileSchema.safeParse(opts.raw);
  if (!parsed.success) {
    const errors = formatSchemaErrors(parsed.error);
    await finish("rejected", { error: "schema", report: { errors } });
    return { status: 400, body: { batch_id: batchId, ok: false, reason: "schema", errors } };
  }
  const file: ImportFile = parsed.data;

  const existing = await loadExisting(sb, ownerId, file.period);
  const known = {
    contracts: new Set(
      existing.contracts.filter((c) => c.external_id).map((c) => String(c.external_id)),
    ),
    charges: new Set(
      existing.charges.filter((c) => c.external_id).map((c) => String(c.external_id)),
    ),
  };
  const dangling = findDanglingRefs(file, known);
  const meta = {
    mode: file.mode,
    period_from: file.period.from,
    period_to: file.period.to,
    source: file.source,
  };
  if (dangling.length > 0) {
    await finish("rejected", { ...meta, error: "references", report: { errors: dangling } });
    return {
      status: 400,
      body: { batch_id: batchId, ok: false, reason: "references", errors: dangling },
    };
  }

  const plan = buildPlan(ownerId, file, existing);
  const report = planReport(plan);
  if (opts.dryRun) {
    await finish("ok", { ...meta, report });
    return {
      status: 200,
      body: {
        batch_id: batchId,
        ok: true,
        dry_run: true,
        received_at: new Date(started).toISOString(),
        period: file.period,
        ...report,
      },
    };
  }
  try {
    await applyPlan(sb, ownerId, batchId, plan);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finish("failed", { ...meta, error: message, report });
    return {
      status: 500,
      body: { batch_id: batchId, ok: false, reason: "apply_failed", error: message, ...report },
    };
  }
  await finish("ok", { ...meta, report });
  return {
    status: 200,
    body: {
      batch_id: batchId,
      ok: true,
      dry_run: false,
      received_at: new Date(started).toISOString(),
      period: file.period,
      ...report,
    },
  };
}
