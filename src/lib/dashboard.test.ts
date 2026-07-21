import { describe, expect, it } from "vitest";
import { computeContourRates, contourOfType, type Contract } from "./dashboard";

let seq = 0;
function contract(over: Partial<Contract> & { area: number; rate: number }): Contract {
  seq += 1;
  return {
    id: `c${seq}`,
    number: `№${seq}`,
    status: "active",
    kind: "rent",
    start_date: "2026-01-01",
    end_date: null,
    payment_period: "monthly",
    currency: "RUB",
    property_id: "p1",
    tenant_id: "t1",
    tenant: null,
    property: { id: "p1", name: "Объект", type: "warehouse", area_total: 1000 },
    ...over,
  };
}

const prop = (type: string) => ({ id: "p1", name: "Объект", type, area_total: 1000 });

describe("contourOfType", () => {
  it("распределяет типы по контурам", () => {
    expect(contourOfType("warehouse")).toBe("Помещения");
    expect(contourOfType("production")).toBe("Помещения");
    expect(contourOfType("other")).toBe("Помещения");
    expect(contourOfType(null)).toBe("Помещения");
    expect(contourOfType("land")).toBe("Земля");
    expect(contourOfType("office")).toBe("Офис");
    expect(contourOfType("parking")).toBe("Машиноместа");
  });
});

describe("computeContourRates", () => {
  it("считает средневзвешенную ставку раздельно по контурам", () => {
    const rates = computeContourRates([
      contract({ area: 100, rate: 300 }),
      contract({ area: 300, rate: 200 }),
      contract({ area: 1000, rate: 100, property: prop("land") }),
      contract({ area: 50, rate: 400, property: prop("office") }),
      contract({ area: 5, rate: 5712, property: prop("parking") }),
    ]);
    expect(rates.map((r) => r.label)).toEqual(["Помещения", "Земля", "Офис", "Машиноместа"]);
    const by = Object.fromEntries(rates.map((r) => [r.label, r]));
    // (100×300 + 300×200) / 400 = 225
    expect(by["Помещения"].rate).toBeCloseTo(225, 5);
    expect(by["Земля"].rate).toBeCloseTo(100, 5);
    expect(by["Офис"].rate).toBeCloseTo(400, 5);
    expect(by["Машиноместа"].rate).toBeCloseTo(5712, 5);
    expect(by["Машиноместа"].unit).toBe("₽/место/мес");
    expect(by["Земля"].unit).toBe("₽/м²/мес");
  });

  it("нормализует ставку к месяцу по payment_period", () => {
    const rates = computeContourRates([
      contract({ area: 100, rate: 300, payment_period: "quarterly" }),
    ]);
    expect(rates[0].rate).toBeCloseTo(100, 5);
  });

  it("игнорирует неактивные договоры и нулевую площадь", () => {
    const rates = computeContourRates([
      contract({ area: 100, rate: 300, status: "finished" }),
      contract({ area: 0, rate: 999 }),
      contract({ area: 200, rate: 250 }),
    ]);
    expect(rates).toHaveLength(1);
    expect(rates[0].rate).toBeCloseTo(250, 5);
    expect(rates[0].contracts).toBe(1);
  });

  it("опускает контуры без договоров", () => {
    expect(computeContourRates([])).toEqual([]);
    const rates = computeContourRates([contract({ area: 10, rate: 100, property: prop("land") })]);
    expect(rates.map((r) => r.label)).toEqual(["Земля"]);
  });
});
