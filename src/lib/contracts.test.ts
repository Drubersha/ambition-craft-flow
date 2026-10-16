import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import {
  contractFormFromRow,
  contractRowFromForm,
  DEPOSIT_PERCENT_MAX,
  type ContractRowInput,
} from "./contracts";

const base: ContractRowInput = {
  tenant_id: "t1",
  property_id: "p1",
  rate: "300",
  area: "100",
  payment_period: "monthly",
  status: "active",
  kind: "rent",
  start_date: "2026-07-01",
};

describe("contractRowFromForm", () => {
  it("приводит пустые строки к null, а числа — к числам", () => {
    const row = contractRowFromForm({ ...base, number: "", cadastral_no: "", end_date: "" });
    expect(row.number).toBeNull();
    expect(row.cadastral_no).toBeNull();
    expect(row.end_date).toBeNull();
    expect(row.rate).toBe(300);
    expect(row.area).toBe(100);
  });

  it("без площади оставляет area null, а не ноль", () => {
    // Договор с фиксированной суммой: площадь не заполняется.
    const row = contractRowFromForm({ ...base, area: "" });
    expect(row.area).toBeNull();
    expect(row.rate).toBe(300);
  });

  it("считает депозит от месячного платежа с учётом площади", () => {
    // 300 ₽/м² × 100 м² = 30 000 ₽/мес; 50% = 15 000 ₽.
    const row = contractRowFromForm({ ...base, deposit_percent: "50" });
    expect(row.deposit_percent).toBe(50);
    expect(row.deposit_amount).toBeCloseTo(15000, 2);
  });

  it("квартальная ставка нормализуется к месяцу при расчёте депозита", () => {
    // 900 ₽ за квартал = 300 ₽/мес × 100 м² = 30 000; 100% = 30 000.
    const row = contractRowFromForm({
      ...base,
      rate: "900",
      payment_period: "quarterly",
      deposit_percent: "100",
    });
    expect(row.deposit_amount).toBeCloseTo(30000, 2);
  });

  it("без процента депозита сумма депозита не считается", () => {
    const row = contractRowFromForm(base);
    expect(row.deposit_percent).toBeNull();
    expect(row.deposit_amount).toBeNull();
  });

  it("единица измерения по умолчанию — квадратные метры", () => {
    expect(contractRowFromForm(base).unit).toBe("sqm");
    expect(contractRowFromForm({ ...base, unit: "space" }).unit).toBe("space");
  });

  it("валюта по умолчанию — рубли", () => {
    expect(contractRowFromForm(base).currency).toBe("RUB");
    expect(contractRowFromForm({ ...base, currency: "USD" }).currency).toBe("USD");
  });
});

describe("contractFormFromRow", () => {
  const filled: ContractRowInput = {
    ...base,
    number: "А-101/2026",
    deposit_percent: "50",
    vat_rate: "20",
    payment_day: "10",
    payment_timing: "advance",
    renew_months: "11",
  };

  it("строка → форма → строка без потерь", () => {
    const row = contractRowFromForm(filled);
    const form = contractFormFromRow(row as Partial<Tables<"contracts">>);
    expect(form.rate).toBe("300");
    expect(form.area).toBe("100");
    expect(form.number).toBe("А-101/2026");
    expect(form.deposit_percent).toBe("50");
    expect(form.vat_rate).toBe("20");
    expect(form.payment_day).toBe("10");
    expect(form.payment_timing).toBe("advance");
    expect(form.renew_months).toBe("11");
    expect(form.end_date).toBe("");
    expect(contractRowFromForm(form)).toEqual(row);
  });

  it("пустая строка даёт те же дефолты, что пустая форма", () => {
    const form = contractFormFromRow({});
    expect(form.currency).toBe("RUB");
    expect(form.unit).toBe("sqm");
    expect(form.payment_period).toBe("monthly");
    expect(form.status).toBe("active");
    expect(form.kind).toBe("rent");
    expect(form.vat_included).toBe(true);
    expect(form.auto_renew).toBe(false);
    expect(form.number).toBe("");
  });

  it("предел процента депозита — одна константа", () => {
    expect(DEPOSIT_PERCENT_MAX).toBe(1000);
  });
});
