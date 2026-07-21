import { describe, expect, it } from "vitest";
import {
  computeContourAreas,
  computeContourRates,
  contourOfType,
  type Contract,
  type Property,
} from "./dashboard";

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

let propSeq = 0;
function property(type: string, area: number): Property {
  propSeq += 1;
  return {
    id: `prop${propSeq}`,
    name: `Объект ${propSeq}`,
    type,
    status: "partial",
    area_total: area,
    base_rate: null,
    currency: "RUB",
  };
}

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

describe("computeContourAreas", () => {
  it("разделяет площадь и занятость по контурам", () => {
    const areas = computeContourAreas(
      [
        property("warehouse", 1000),
        property("production", 500),
        property("land", 4000),
        property("office", 700),
        property("parking", 35),
      ],
      [
        contract({ area: 600, rate: 200 }),
        contract({ area: 4000, rate: 100, property: prop("land") }),
        contract({ area: 350, rate: 400, property: prop("office") }),
        contract({ area: 21, rate: 6000, property: prop("parking") }),
      ],
      [],
    );
    const by = Object.fromEntries(areas.map((a) => [a.label, a]));
    expect(areas.map((a) => a.label)).toEqual(["Помещения", "Земля", "Офис", "Машиноместа"]);
    // склад + производство складываются в один контур «Помещения»
    expect(by["Помещения"].total).toBe(1500);
    expect(by["Помещения"].properties).toBe(2);
    expect(by["Помещения"].occupancy).toBeCloseTo(40, 5);
    expect(by["Земля"].occupancy).toBeCloseTo(100, 5);
    expect(by["Офис"].occupancy).toBeCloseTo(50, 5);
    expect(by["Машиноместа"].total).toBe(35);
    expect(by["Машиноместа"].unit).toBe("мест");
    expect(by["Земля"].unit).toBe("м²");
  });

  it("исключает АХЧ из базы занятости", () => {
    const areas = computeContourAreas(
      [property("warehouse", 1000)],
      [contract({ area: 400, rate: 100 })],
      [contract({ area: 200, rate: 0, kind: "ahch" })],
    );
    expect(areas[0].ahch).toBe(200);
    // 400 / (1000 − 200) = 50%
    expect(areas[0].occupancy).toBeCloseTo(50, 5);
  });

  it("не считает занятость, когда у контура нет площади", () => {
    const areas = computeContourAreas(
      [property("other", 0)],
      [contract({ area: 100, rate: 100, property: prop("other") })],
      [],
    );
    expect(areas[0].total).toBe(0);
    expect(areas[0].occupancy).toBeNull();
  });

  it("учитывает объекты без договоров и игнорирует неактивные договоры", () => {
    const areas = computeContourAreas(
      [property("land", 500)],
      [contract({ area: 500, rate: 100, property: prop("land"), status: "finished" })],
      [],
    );
    expect(areas.map((a) => a.label)).toEqual(["Земля"]);
    expect(areas[0].leased).toBe(0);
    expect(areas[0].occupancy).toBe(0);
  });
});
