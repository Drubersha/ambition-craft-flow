import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ImportFileSchema, findDanglingRefs, type ImportFile } from "./import-1c.schema";
import {
  allocatePayment,
  buildPlan,
  computeDueDate,
  diffRow,
  type Existing,
  type Plan,
  type Row,
} from "./import-1c";

const OWNER = "4147b991-8fa1-43c3-ab51-b2418b601493";

function loadSample(): ImportFile {
  const raw = JSON.parse(
    readFileSync(resolve(__dirname, "../../docs/1c/1c-export.sample.json"), "utf8"),
  );
  return ImportFileSchema.parse(raw);
}

function empty(): Existing {
  return {
    tenants: [],
    properties: [],
    contracts: [],
    charges: [],
    payments: [],
    tenantContacts: [],
  };
}

/** Превращает план в «состояние базы после записи» — для проверки идемпотентности. */
function materialize(plan: Plan, base: Existing): Existing {
  const next: Existing = {
    tenants: base.tenants.map((r) => ({ ...r })),
    properties: base.properties.map((r) => ({ ...r })),
    contracts: base.contracts.map((r) => ({ ...r })),
    charges: base.charges.map((r) => ({ ...r })),
    payments: base.payments.map((r) => ({ ...r })),
    tenantContacts: base.tenantContacts.map((r) => ({ ...r })),
  };
  const tableOf = (t: string) => next[t as keyof Existing] as Row[];
  for (const op of plan.ops) {
    const rows = tableOf(op.table);
    if (op.action === "create") rows.push({ paid_total: 0, ...op.row });
    else {
      const r = rows.find((x) => x.id === op.id);
      if (r) Object.assign(r, op.row);
    }
  }
  for (const v of plan.voids) {
    const rows = tableOf(v.table);
    const idx = rows.findIndex((x) => x.id === v.id);
    if (idx >= 0) rows.splice(idx, 1);
  }
  for (const c of plan.contactsReplace) {
    next.tenantContacts = next.tenantContacts
      .filter((r) => r.tenant_id !== c.tenantId)
      .concat(c.contacts);
  }
  // paid_total, как его посчитал бы триггер в базе.
  for (const ch of next.charges) {
    ch.paid_total = next.payments
      .filter((p) => p.charge_id === ch.id)
      .reduce((s, p) => s + Number(p.amount), 0);
  }
  return next;
}

describe("1c schema", () => {
  it("accepts the published sample file", () => {
    const file = loadSample();
    expect(file.counterparties).toHaveLength(3);
    expect(file.payments.find((p) => p.doc_type === "offset")?.offset?.basis_doc_number).toBe(
      "Акт зачёта № 7",
    );
    expect(findDanglingRefs(file, { contracts: new Set(), charges: new Set() })).toEqual([]);
  });
  it("rejects a foreign-looking INN and reports the path", () => {
    const file = loadSample();
    const raw = JSON.parse(JSON.stringify(file));
    raw.charges[0].date = "31.10.2026";
    const res = ImportFileSchema.safeParse(raw);
    expect(res.success).toBe(false);
  });
  it("finds dangling references", () => {
    const file = loadSample();
    const broken = {
      ...file,
      payments: [
        {
          ...file.payments[0],
          allocations: [{ charge_id: "00000000-0000-4000-8000-000000000000", amount: 1 }],
        },
      ],
    };
    const refs = findDanglingRefs(broken, { contracts: new Set(), charges: new Set() });
    expect(refs[0].path).toBe("payments[0].allocations[0].charge_id");
  });
});

describe("computeDueDate", () => {
  it("falls back to the last day of the next month", () => {
    expect(computeDueDate(null, "2026-10-01", "2026-10-31")).toBe("2026-11-30");
    expect(computeDueDate(null, "2026-01-01", "2026-01-31")).toBe("2026-02-28");
  });
  it("uses payment_day and timing of the contract", () => {
    expect(
      computeDueDate({ payment_day: 10, payment_timing: "current" }, "2026-10-01", "2026-10-31"),
    ).toBe("2026-10-10");
    expect(
      computeDueDate({ payment_day: 25, payment_timing: "advance" }, "2026-10-01", "2026-10-31"),
    ).toBe("2026-09-25");
    expect(
      computeDueDate({ payment_day: 31, payment_timing: "arrears" }, "2026-10-01", "2026-10-31"),
    ).toBe("2026-11-30");
  });
});

describe("allocatePayment", () => {
  const cands = [
    { id: "c2", periodStart: "2026-02-01", remaining: 100 },
    { id: "c1", periodStart: "2026-01-01", remaining: 50 },
  ];
  it("keeps explicit allocations", () => {
    expect(allocatePayment(80, [{ chargeId: "c2", amount: 80 }], cands)).toEqual([
      { chargeId: "c2", amount: 80 },
    ]);
  });
  it("spreads FIFO by period start", () => {
    expect(allocatePayment(120, [], cands)).toEqual([
      { chargeId: "c1", amount: 50 },
      { chargeId: "c2", amount: 70 },
    ]);
  });
  it("puts the surplus on the latest charge as an advance", () => {
    expect(allocatePayment(200, [], cands)).toEqual([
      { chargeId: "c1", amount: 50 },
      { chargeId: "c2", amount: 150 },
    ]);
  });
  it("returns nothing without candidates", () => {
    expect(allocatePayment(10, [], [])).toEqual([]);
  });
});

describe("diffRow", () => {
  it("ignores equal numbers in different representations and empty strings", () => {
    const { patch } = diffRow(
      { rate: "950.00", kpp: "", end_date: "2026-12-31" },
      { rate: 950, kpp: null, end_date: "2026-12-31" },
    );
    expect(patch).toEqual({});
  });
  it("reports changed fields with their previous values", () => {
    const { patch, before } = diffRow({ rate: 900, area: 45 }, { rate: 950, area: 45 });
    expect(patch).toEqual({ rate: 950 });
    expect(before).toEqual({ rate: 900 });
  });
});

describe("buildPlan on the sample", () => {
  it("creates everything on an empty base and is idempotent on the second run", () => {
    const file = loadSample();
    const plan = buildPlan(OWNER, file, empty());
    expect(plan.counts.tenants.created).toBe(3);
    expect(plan.counts.properties.created).toBe(2);
    expect(plan.counts.contracts.created).toBe(3); // 2 договора + допсоглашение
    expect(plan.counts.charges.created).toBe(3);
    expect(plan.counts.payments.created).toBe(3);
    expect(plan.skipped).toEqual([]);
    expect(plan.voids).toEqual([]);
    expect(plan.balanceMismatches).toEqual([]);
    // Зачёт сохраняет основание и помечается как взаимозачёт.
    const offset = plan.ops.find((o) => o.table === "payments" && o.row.doc_type === "offset");
    expect(offset?.row.method).toBe("Взаимозачёт");
    expect((offset?.row.offset_info as { expense_category?: string }).expense_category).toBe(
      "Текущий ремонт",
    );
    // Допсоглашение ссылается на родителя и несёт его условия.
    const amendment = plan.ops.find((o) => o.table === "contracts" && o.row.parent_contract_id);
    const parent = plan.ops.find(
      (o) =>
        o.table === "contracts" && o.row.external_id === "9a2f0b7d-5e6c-4c1e-8b4d-6f1c2a3e0001",
    );
    expect(amendment?.row.parent_contract_id).toBe(parent?.id);
    expect(amendment?.row.start_date).toBe("2026-07-01");

    const after = materialize(plan, empty());
    const second = buildPlan(OWNER, file, after);
    expect(second.ops).toEqual([]);
    expect(second.voids).toEqual([]);
    expect(second.contactsReplace).toEqual([]);
    expect(second.counts.charges.unchanged).toBe(3);
    expect(second.counts.payments.unchanged).toBe(3);
  });

  it("links hand-made tenants and contracts by INN and number instead of duplicating", () => {
    const file = loadSample();
    const base = empty();
    base.tenants.push({
      id: "t-manual",
      owner_id: OWNER,
      name: "Вектор Трейд ООО",
      kind: "company",
      inn: "1655123456",
      external_id: null,
    });
    base.properties.push({
      id: "p-manual",
      owner_id: OWNER,
      name: "офис 101",
      address: "x",
      external_id: null,
    });
    base.contracts.push({
      id: "c-manual",
      owner_id: OWNER,
      tenant_id: "t-manual",
      property_id: "p-manual",
      number: "А-101/2026",
      external_id: null,
      parent_contract_id: null,
      rate: 900,
      area: 45,
    });
    const plan = buildPlan(OWNER, file, base);
    const t = plan.ops.find(
      (o) => o.table === "tenants" && o.externalId === "6f1c2a3e-8b4d-4c1e-9a2f-0b7d5e6c1a01",
    );
    expect(t?.action).toBe("link");
    expect(t?.id).toBe("t-manual");
    const c = plan.ops.find(
      (o) => o.table === "contracts" && o.externalId === "9a2f0b7d-5e6c-4c1e-8b4d-6f1c2a3e0001",
    );
    expect(c?.action).toBe("link");
    expect(c?.row.rate).toBe(950);
    expect(c?.before?.rate).toBe(900);
    expect(plan.counts.tenants.created).toBe(2);
  });

  it("voids imported documents that vanished from the window and applies cancellations", () => {
    const file = loadSample();
    const first = materialize(buildPlan(OWNER, file, empty()), empty());
    // Документ, которого больше нет в файле, но он в окне → аннулировать.
    const ghost: Row = {
      id: "ch-ghost",
      owner_id: OWNER,
      contract_id: first.contracts[0].id,
      external_id: "5e6c1a01-0b7d-4c1e-9a2f-8b4d6f1c0999",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      doc_date: "2026-08-31",
      total: 1,
      paid_total: 0,
    };
    first.charges.push(ghost);
    const cancelled = {
      ...file,
      payments: file.payments.map((p, i) => (i === 2 ? { ...p, is_cancelled: true } : p)),
    };
    const plan = buildPlan(OWNER, cancelled, first);
    expect(plan.voids.map((v) => v.id).sort()).toEqual(
      ["ch-ghost", first.payments.find((p) => p.doc_type === "cash_in")!.id as string].sort(),
    );
    expect(plan.counts.charges.voided).toBe(1);
    expect(plan.counts.payments.voided).toBe(1);
    // Аннулированный платёж возвращает долг — сверка с сальдо 1С это покажет.
    expect(plan.balanceMismatches).toHaveLength(1);
    expect(plan.balanceMismatches[0].diff).toBe(8000);
  });

  it("allocates a payment without allocations FIFO across the contract charges", () => {
    const file = loadSample();
    const first = materialize(buildPlan(OWNER, file, empty()), empty());
    const extra = {
      ...file,
      payments: [
        ...file.payments,
        {
          ...file.payments[0],
          id: "8b4d6f1c-0b7d-4c1e-9a2f-5e6c1a010999",
          number: "199",
          date: "2026-10-12",
          amount: 5000,
          allocations: [],
        },
      ],
    };
    const plan = buildPlan(OWNER, extra, first);
    const rows = plan.ops.filter(
      (o) => o.table === "payments" && o.externalId === "8b4d6f1c-0b7d-4c1e-9a2f-5e6c1a010999",
    );
    // Единственный незакрытый остаток по договору А-101 — коммуналка 3 900, излишек идёт авансом туда же.
    expect(rows).toHaveLength(1);
    expect(rows[0].row.amount).toBe(5000);
    const utilities = first.charges.find((c) => c.kind === "utilities");
    expect(rows[0].row.charge_id).toBe(utilities?.id);
  });

  it("skips a new contract without a property and explains why", () => {
    const file = loadSample();
    const noProp = {
      ...file,
      properties: [],
      contracts: file.contracts.map((c) => ({ ...c, property_id: null })),
    };
    const plan = buildPlan(OWNER, noProp, empty());
    expect(plan.counts.contracts.created).toBe(0);
    expect(plan.skipped.filter((s) => s.path === "contracts")).toHaveLength(2);
    expect(plan.skipped[0].reason).toMatch(/объект/);
  });
});
