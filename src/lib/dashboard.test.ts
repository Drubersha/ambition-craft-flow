import { describe, expect, it } from "vitest";
import {
  computeCollectionRate,
  computeDebtAging,
  expandContractLinks,
  monthPaymentsToPast,
  splitByCurrentMonth,
  computeContourAreas,
  computeContourIncomes,
  computeContourRates,
  contourOfType,
  type Charge,
  type Contract,
  type Payment,
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

  it("считает свободную площадь и потенциал сдачи", () => {
    const areas = computeContourAreas(
      [property("warehouse", 1000)],
      [contract({ area: 400, rate: 100 })],
      [contract({ area: 200, rate: 0, kind: "ahch" })],
    );
    expect(areas[0].leased).toBe(400);
    expect(areas[0].ahch).toBe(200);
    // 1000 - 400 - 200
    expect(areas[0].free).toBe(400);
    // всё, кроме АХЧ
    expect(areas[0].rentable).toBe(800);
    // сдано + свободно + АХЧ = вся площадь
    expect(areas[0].leased + areas[0].free + areas[0].ahch).toBe(areas[0].total);
  });

  it("при пересдаче свободная площадь не уходит в минус", () => {
    // Склад 24 в боевых данных: объект 820 м², договоров на 897.5 м².
    const areas = computeContourAreas(
      [property("warehouse", 820)],
      [contract({ area: 897.5, rate: 100 })],
      [],
    );
    expect(areas[0].free).toBe(0);
    expect(areas[0].rentable).toBe(820);
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

describe("computeContourIncomes", () => {
  const charge = (id: string, contractId: string): Charge => ({
    id,
    contract_id: contractId,
    total: 0,
    paid_total: 0,
    status: "paid",
    due_date: null,
    period_start: "2026-06-01",
    period_end: "2026-06-30",
  });
  const payment = (chargeId: string, amount: number, paidAt: string): Payment => ({
    id: `pay-${chargeId}-${amount}`,
    charge_id: chargeId,
    amount,
    paid_at: paidAt,
    method: null,
  });

  it("разносит платежи и месячные начисления по контурам", () => {
    const premises = contract({ area: 100, rate: 200 });
    const land = contract({ area: 1000, rate: 50, property: prop("land") });
    const parking = contract({ area: 5, rate: 6000, property: prop("parking") });
    const incomes = computeContourIncomes(
      {
        properties: [],
        contracts: [premises, land, parking],
        charges: [charge("ch1", premises.id), charge("ch2", land.id), charge("ch3", parking.id)],
        payments: [
          payment("ch1", 20000, "2026-06-10"),
          payment("ch2", 50000, "2026-06-15"),
          payment("ch3", 30000, "2026-06-20"),
        ],
        ahchContracts: [],
      },
      new Date("2026-06-01"),
      new Date("2026-06-30"),
    );
    const by = Object.fromEntries(incomes.map((i) => [i.label, i]));
    expect(incomes.map((i) => i.label)).toEqual(["Помещения", "Земля", "Машиноместа"]);
    expect(by["Помещения"].rentIncome).toBe(20000);
    expect(by["Помещения"].monthlyIncome).toBeCloseTo(20000, 5);
    expect(by["Земля"].rentIncome).toBe(50000);
    expect(by["Земля"].monthlyIncome).toBeCloseTo(50000, 5);
    expect(by["Машиноместа"].rentIncome).toBe(30000);
    expect(by["Машиноместа"].monthlyIncome).toBeCloseTo(30000, 5);
  });

  it("считает платежи по завершённым договорам, но не их месячные начисления", () => {
    const finished = contract({ area: 100, rate: 300, status: "finished" });
    const incomes = computeContourIncomes(
      {
        properties: [],
        contracts: [finished],
        charges: [charge("ch1", finished.id)],
        payments: [payment("ch1", 15000, "2026-06-10")],
        ahchContracts: [],
      },
      new Date("2026-06-01"),
      new Date("2026-06-30"),
    );
    expect(incomes[0].rentIncome).toBe(15000);
    expect(incomes[0].monthlyIncome).toBe(0);
  });

  it("отсекает платежи вне периода", () => {
    const c = contract({ area: 100, rate: 200 });
    const incomes = computeContourIncomes(
      {
        properties: [],
        contracts: [c],
        charges: [charge("ch1", c.id)],
        payments: [payment("ch1", 9999, "2026-05-31"), payment("ch1", 7000, "2026-06-05")],
        ahchContracts: [],
      },
      new Date("2026-06-01"),
      new Date("2026-06-30"),
    );
    expect(incomes[0].rentIncome).toBe(7000);
  });
});

describe("computeCollectionRate", () => {
  it("считает долю оплаченного от начисленного", () => {
    const r = computeCollectionRate([
      { total: 100, paid_total: 100 },
      { total: 100, paid_total: 50 },
    ]);
    expect(r.billed).toBe(200);
    expect(r.collected).toBe(150);
    expect(r.rate).toBeCloseTo(75, 5);
  });

  it("переплата по одному начислению не закрывает недоплату по другому", () => {
    // Иначе гашение долга прошлых месяцев маскирует текущую недоплату.
    const r = computeCollectionRate([
      { total: 100, paid_total: 500 },
      { total: 100, paid_total: 0 },
    ]);
    expect(r.collected).toBe(100);
    expect(r.rate).toBeCloseTo(50, 5);
  });

  it("никогда не превышает 100%", () => {
    const r = computeCollectionRate([{ total: 65721, paid_total: 2399991.41 }]);
    expect(r.rate).toBeLessThanOrEqual(100);
  });

  it("воспроизводит реальный июль 2026: 87.2%, а не 100%", () => {
    // Начислено 65 721, оплачено по этим начислениям 57 321, не оплачено 8 400.
    const r = computeCollectionRate([
      { total: 57321, paid_total: 57321 },
      { total: 8400, paid_total: 0 },
    ]);
    expect(r.billed).toBe(65721);
    expect(r.collected).toBe(57321);
    expect(r.rate).toBeCloseTo(87.2, 1);
  });

  it("без начислений возвращает null, а не ноль или деление на ноль", () => {
    expect(computeCollectionRate([]).rate).toBeNull();
    expect(computeCollectionRate([{ total: 0, paid_total: 0 }]).rate).toBeNull();
  });
});

describe("computeDebtAging", () => {
  const TODAY = new Date(2026, 6, 21); // 21.07.2026
  const charge = (remain: number, due: string | null) => ({
    total: remain,
    paid_total: 0,
    due_date: due,
  });

  it("раскладывает долг по срокам давности", () => {
    const a = computeDebtAging(
      [
        charge(100, "2026-08-01"), // срок не наступил
        charge(200, "2026-07-10"), // 11 дней
        charge(300, "2026-06-10"), // 41 день
        charge(400, "2026-05-10"), // 72 дня
        charge(500, "2026-01-10"), // больше 90
      ],
      TODAY,
    );
    expect(a.buckets.map((b) => [b.label, b.amount])).toEqual([
      ["Срок не наступил", 100],
      ["До 30 дней", 200],
      ["31–60 дней", 300],
      ["61–90 дней", 400],
      ["Более 90 дней", 500],
    ]);
  });

  it("корзины складываются в общий долг", () => {
    const a = computeDebtAging(
      [charge(100, "2026-08-01"), charge(200, "2026-07-10"), charge(500, "2026-01-10")],
      TODAY,
    );
    expect(a.total).toBe(800);
    expect(a.buckets.reduce((s, b) => s + b.amount, 0)).toBe(a.total);
    // Просрочка — всё, кроме ещё не наступившего срока.
    expect(a.overdue).toBe(700);
  });

  it("начисления без срока не теряются, а идут отдельной корзиной", () => {
    const a = computeDebtAging([charge(150, null)], TODAY);
    expect(a.buckets).toEqual([
      { label: "Без срока оплаты", amount: 150, count: 1, overdue: false },
    ]);
    expect(a.total).toBe(150);
    expect(a.overdue).toBe(0);
  });

  it("оплаченные и переплаченные начисления в долг не попадают", () => {
    const a = computeDebtAging(
      [
        { total: 100, paid_total: 100, due_date: "2026-01-01" },
        { total: 100, paid_total: 500, due_date: "2026-01-01" },
        { total: 100, paid_total: 40, due_date: "2026-01-01" },
      ],
      TODAY,
    );
    expect(a.total).toBeCloseTo(60, 5);
  });

  it("пустые корзины не показываются", () => {
    const a = computeDebtAging([charge(100, "2026-07-10")], TODAY);
    expect(a.buckets).toHaveLength(1);
    expect(a.buckets[0].label).toBe("До 30 дней");
  });

  it("граница ровно 30 и 31 день разводится по корзинам", () => {
    const at30 = computeDebtAging([charge(10, "2026-06-21")], TODAY);
    const at31 = computeDebtAging([charge(10, "2026-06-20")], TODAY);
    expect(at30.buckets[0].label).toBe("До 30 дней");
    expect(at31.buckets[0].label).toBe("31–60 дней");
  });
});

describe("expandContractLinks", () => {
  it("раскрывает составной договор по объектам, одиночные не трогает", () => {
    const single = contract({ area: 100, rate: 200 });
    const multi = contract({ area: 103.9, rate: 178 });
    const rooms = [property("office", 45.2), property("office", 30.7)];
    const links = [
      { contract_id: multi.id, property_id: rooms[0].id, area: 45.2 },
      { contract_id: multi.id, property_id: rooms[1].id, area: 30.7 },
    ];
    const out = expandContractLinks([single, multi], links, rooms);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(single);
    const parts = out.slice(1);
    expect(parts.map((c) => c.area)).toEqual([45.2, 30.7]);
    expect(parts.map((c) => c.property_id)).toEqual([rooms[0].id, rooms[1].id]);
    // Виртуальные строки несут тип объекта — контур считается правильно.
    expect(parts[0].property?.type).toBe("office");
    // Ставка договора сохраняется в каждой строке, но доход по связкам не считают.
    expect(parts[0].rate).toBe(178);
  });

  it("без связок возвращает исходный список как есть", () => {
    const c = contract({ area: 50, rate: 100 });
    expect(expandContractLinks([c], [], [])).toEqual([c]);
    expect(expandContractLinks([c], undefined, [])).toEqual([c]);
  });
});

describe("splitByCurrentMonth", () => {
  const TODAY = new Date(2026, 6, 22); // 22.07.2026
  const ch = (period_start: string, total = 100, paid_total = 0) => ({
    period_start,
    total,
    paid_total,
  });

  it("начисления текущего месяца отделяются от прошлых", () => {
    const { current, past } = splitByCurrentMonth(
      [ch("2026-07-01"), ch("2026-07-15"), ch("2026-06-01"), ch("2025-07-01")],
      TODAY,
    );
    expect(current.map((c) => c.period_start)).toEqual(["2026-07-01", "2026-07-15"]);
    expect(past.map((c) => c.period_start)).toEqual(["2026-06-01", "2025-07-01"]);
  });

  it("прошлогодний тот же месяц — не текущий", () => {
    const { current } = splitByCurrentMonth([ch("2025-07-01")], TODAY);
    expect(current).toHaveLength(0);
  });

  it("платежи месяца делятся на текущие и гасящие прошлые периоды", () => {
    // Июль 2026: поступило 300, из них 200 закрыли июньское начисление —
    // собираемость июля поднимает только сотня, ушедшая на июльское.
    const charges = [
      { id: "june", period_start: "2026-06-01" },
      { id: "july", period_start: "2026-07-01" },
    ];
    const payments = [
      { amount: 200, paid_at: "2026-07-20", charge_id: "june" },
      { amount: 100, paid_at: "2026-07-22", charge_id: "july" },
      { amount: 999, paid_at: "2026-06-30", charge_id: "june" }, // не этот месяц
    ];
    const r = monthPaymentsToPast(payments, charges, new Date(2026, 6, 22));
    expect(r.monthTotal).toBe(300);
    expect(r.toPastPeriods).toBe(200);
  });

  it("платёж на неизвестное начисление входит в итог, но не в прошлые периоды", () => {
    const r = monthPaymentsToPast(
      [{ amount: 50, paid_at: "2026-07-05", charge_id: "ghost" }],
      [],
      new Date(2026, 6, 22),
    );
    expect(r.monthTotal).toBe(50);
    expect(r.toPastPeriods).toBe(0);
  });

  it("воспроизводит июль 2026: свежая аренда не раздувает дебиторку", () => {
    // Старое начисление 100 (не оплачено) + июльская аренда 200 со сроком 31.08:
    // дебиторка прошлых периодов = 100, текущий месяц отдельно = 200.
    const charges = [
      { period_start: "2026-06-01", total: 100, paid_total: 0, due_date: "2026-07-31" },
      { period_start: "2026-07-01", total: 200, paid_total: 0, due_date: "2026-08-31" },
    ];
    const { current, past } = splitByCurrentMonth(charges, TODAY);
    const aging = computeDebtAging(past, TODAY);
    const currentUnpaid = current.reduce((s, c) => s + Math.max(c.total - c.paid_total, 0), 0);
    expect(aging.total).toBe(100);
    expect(currentUnpaid).toBe(200);
  });
});
