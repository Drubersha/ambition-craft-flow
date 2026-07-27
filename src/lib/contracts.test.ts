import { describe, expect, it } from "vitest";
import { contractRowFromForm, type ContractRowInput } from "./contracts";

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
