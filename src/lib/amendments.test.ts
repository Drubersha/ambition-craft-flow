import { describe, expect, it } from "vitest";
import { diffContractTerms, summarizeChanges, termsToApply } from "./amendments";

const parent = {
  id: "c1",
  number: "ЭВ/2024/0624",
  property_id: "p1",
  area: 115,
  unit: "sqm",
  rate: 200,
  currency: "RUB",
  payment_period: "monthly",
  vat_rate: 20,
  vat_included: true,
  payment_day: 25,
  payment_timing: "advance",
  has_variable_part: true,
  start_date: "2024-04-01",
  end_date: null,
  status: "active",
};

describe("diffContractTerms", () => {
  it("находит изменение ставки и показывает суммы деньгами", () => {
    const changes = diffContractTerms(parent, { ...parent, rate: 279.58 });
    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBe("rate");
    expect(changes[0].label).toBe("Ставка");
    expect(changes[0].before).toContain("200");
    expect(changes[0].after).toContain("279");
  });

  it("одинаковые условия дают пустой список", () => {
    expect(diffContractTerms(parent, { ...parent })).toEqual([]);
  });

  it("число-строка из Postgres не считается изменением", () => {
    // numeric приходит строкой: "115.00" — та же площадь, что и 115.
    const changes = diffContractTerms(parent, { ...parent, area: "115.00", rate: "200.0000" });
    expect(changes).toEqual([]);
  });

  it("заполнение пустого поля — это изменение, а не совпадение", () => {
    const changes = diffContractTerms(parent, { ...parent, end_date: "2025-03-01" });
    expect(changes).toHaveLength(1);
    expect(changes[0].before).toBe("—");
    expect(changes[0].after).toBe("01.03.2025");
  });

  it("null и пустая строка считаются одним и тем же", () => {
    const changes = diffContractTerms(
      { ...parent, jurisdiction: null },
      { ...parent, jurisdiction: "" },
    );
    expect(changes).toEqual([]);
  });

  it("объект показывается названием, а не идентификатором", () => {
    const changes = diffContractTerms(
      parent,
      { ...parent, property_id: "p2" },
      {
        p1: "Склад 12",
        p2: "Склад 7",
      },
    );
    expect(changes[0].before).toBe("Склад 12");
    expect(changes[0].after).toBe("Склад 7");
  });

  it("переводит служебные значения на русский", () => {
    const changes = diffContractTerms(parent, {
      ...parent,
      payment_timing: "arrears",
      status: "finished",
      unit: "space",
    });
    const by = Object.fromEntries(changes.map((c) => [c.key, c]));
    expect(by.payment_timing.after).toContain("постоплата");
    expect(by.status.after).toBe("Завершён");
    expect(by.unit.after).toBe("машиноместа");
  });

  it("булево показывается как да/нет", () => {
    const changes = diffContractTerms(parent, { ...parent, has_variable_part: false });
    expect(changes[0].before).toBe("да");
    expect(changes[0].after).toBe("нет");
  });

  it("несколько изменений идут в заданном порядке полей", () => {
    const changes = diffContractTerms(parent, { ...parent, rate: 300, area: 120 });
    expect(changes.map((c) => c.key)).toEqual(["area", "rate"]);
  });

  it("без родителя или допника разницы нет", () => {
    expect(diffContractTerms(null, parent)).toEqual([]);
    expect(diffContractTerms(parent, undefined)).toEqual([]);
  });
});

describe("termsToApply", () => {
  it("переносит в основной договор только изменённые условия", () => {
    const amendment = { ...parent, rate: 279.58, area: 120 };
    const patch = termsToApply(diffContractTerms(parent, amendment), amendment);
    expect(patch).toEqual({ rate: 279.58, area: 120 });
  });

  it("не переносит служебные поля документа", () => {
    // Номер у допсоглашения свой — он не должен затирать номер договора.
    const amendment = { ...parent, number: "ДС-1", rate: 250 };
    const patch = termsToApply(diffContractTerms(parent, amendment), amendment);
    expect(patch).not.toHaveProperty("number");
    expect(patch).toEqual({ rate: 250 });
  });

  it("очистка поля переносится как null", () => {
    const amendment = { ...parent, payment_timing: null };
    const patch = termsToApply(diffContractTerms(parent, amendment), amendment);
    expect(patch).toEqual({ payment_timing: null });
  });
});

describe("summarizeChanges", () => {
  it("перечисляет названия изменённых полей", () => {
    const changes = diffContractTerms(parent, { ...parent, rate: 300, area: 120 });
    expect(summarizeChanges(changes)).toBe("Площадь / количество, Ставка");
  });

  it("сообщает, когда допсоглашение ничего не меняет", () => {
    expect(summarizeChanges([])).toBe("условия не изменены");
  });
});
