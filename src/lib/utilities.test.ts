import { describe, expect, it } from "vitest";
import {
  allocateUtilityCosts,
  consumptionForPeriod,
  daysOverlap,
  isAnomalous,
  monthlyConsumption,
  seasonalBaselineDaily,
  valueAt,
} from "./utilities";

describe("consumptionForPeriod", () => {
  const readings = [
    { reading: 100, read_at: "2026-01-31" },
    { reading: 150, read_at: "2026-02-28" },
    { reading: 210, read_at: "2026-03-31" },
  ];

  it("считает расход между граничными показаниями", () => {
    expect(consumptionForPeriod(0, readings, "2026-02-28", "2026-03-31")).toBe(60);
  });

  it("берёт start_value как нулевую точку для б/у счётчика", () => {
    expect(consumptionForPeriod(80, readings, "2026-01-01", "2026-01-31")).toBe(20);
  });

  it("возвращает null, если данных за период нет", () => {
    expect(consumptionForPeriod(0, [], "2026-02-01", "2026-02-28")).toBeNull();
    expect(consumptionForPeriod(0, readings.slice(0, 1), "2026-02-01", "2026-02-28")).toBeNull();
  });

  it("обрезает отрицательный расход до нуля", () => {
    const rollover = [
      { reading: 500, read_at: "2026-01-31" },
      { reading: 10, read_at: "2026-02-28" },
    ];
    expect(consumptionForPeriod(0, rollover, "2026-01-31", "2026-02-28")).toBe(0);
  });

  it("valueAt отдаёт последнее показание до даты", () => {
    expect(valueAt(0, readings, "2026-03-01")).toBe(150);
    expect(valueAt(7, readings, "2026-01-01")).toBe(7);
  });
});

describe("daysOverlap", () => {
  it("полный месяц", () => {
    expect(daysOverlap("2026-01-01", null, "2026-06-01", "2026-06-30")).toBe(30);
  });
  it("досрочный выезд режет период", () => {
    expect(daysOverlap("2026-01-01", "2026-06-15", "2026-06-01", "2026-06-30")).toBe(15);
  });
  it("нет пересечения", () => {
    expect(daysOverlap("2026-07-01", null, "2026-06-01", "2026-06-30")).toBe(0);
  });
});

describe("allocateUtilityCosts", () => {
  it("по счётчикам с тарифом от общего счётчика, остаток по площади", () => {
    // Общий счётчик: 1000 ед за 10000 ₽ → тариф 10 ₽/ед.
    // Арендаторы намотали 300 и 500 → 3000 и 5000; остаток 2000 по площади 50/50.
    const res = allocateUtilityCosts({
      totalAmount: 10000,
      commonConsumption: 1000,
      entries: [
        { contractId: "a", meterId: "m1", consumption: 300, area: 50, days: 30 },
        { contractId: "b", meterId: "m2", consumption: 500, area: 50, days: 30 },
      ],
    });
    expect(res.map((r) => r.amount)).toEqual([4000, 6000]);
    expect(res[0].method).toBe("mixed");
  });

  it("суммы сходятся с общим счётом", () => {
    const res = allocateUtilityCosts({
      totalAmount: 1000,
      commonConsumption: 999,
      entries: [
        { contractId: "a", consumption: 333, area: 33.3, days: 30 },
        { contractId: "b", consumption: 333, area: 33.4, days: 30 },
        { contractId: "c", consumption: null, area: 33.3, days: 30 },
      ],
    });
    const sum = res.reduce((s, r) => s + r.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(1000);
  });

  it("без общего счётчика тариф считается от суммы арендаторских", () => {
    const res = allocateUtilityCosts({
      totalAmount: 800,
      entries: [
        { contractId: "a", consumption: 100, area: 0, days: 30 },
        { contractId: "b", consumption: 300, area: 0, days: 30 },
      ],
    });
    expect(res.map((r) => r.amount)).toEqual([200, 600]);
    expect(res.map((r) => r.method)).toEqual(["by_meter", "by_meter"]);
  });

  it("режим by_area делит по м²·дням (досрочный выезд платит меньше)", () => {
    const res = allocateUtilityCosts({
      totalAmount: 900,
      mode: "by_area",
      entries: [
        { contractId: "a", consumption: null, area: 100, days: 30 },
        { contractId: "b", consumption: null, area: 100, days: 15 },
      ],
    });
    expect(res.map((r) => r.amount)).toEqual([600, 300]);
  });

  it("арендатор без счётчика получает только долю по площади", () => {
    const res = allocateUtilityCosts({
      totalAmount: 1200,
      commonConsumption: 100,
      entries: [
        { contractId: "a", consumption: 50, area: 50, days: 30 },
        { contractId: "b", consumption: null, area: 50, days: 30 },
      ],
    });
    // Тариф 12 ₽/ед: a по счётчику 600, остаток 600 делится 50/50.
    expect(res[0].amount).toBe(900);
    expect(res[1].amount).toBe(300);
    expect(res[1].method).toBe("by_area");
  });
});

describe("сезонная база и алерты", () => {
  const year = (y: number, m: number, c: number) => {
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-28`;
    return { start, end, consumption: c };
  };

  it("берёт тот же сезон год назад, а не соседние месяцы", () => {
    const intervals = [
      year(2025, 6, 270), // прошлый июнь — база
      year(2026, 4, 900),
      year(2026, 5, 900),
    ];
    const current = year(2026, 6, 300);
    const base = seasonalBaselineDaily(intervals, current);
    expect(base).toBeCloseTo(10, 5); // 270 за 27 дней
  });

  it("фолбэк: среднее последних интервалов, если года данных нет", () => {
    const intervals = [year(2026, 3, 270), year(2026, 4, 270), year(2026, 5, 270)];
    const base = seasonalBaselineDaily(intervals, year(2026, 6, 999));
    expect(base).toBeCloseTo(10, 5);
  });

  it("null без истории", () => {
    expect(seasonalBaselineDaily([], year(2026, 6, 1))).toBeNull();
  });

  it("isAnomalous срабатывает от 30%", () => {
    expect(isAnomalous(13.1, 10)).toBe(true);
    expect(isAnomalous(6.9, 10)).toBe(true);
    expect(isAnomalous(12, 10)).toBe(false);
    expect(isAnomalous(100, null)).toBe(false);
  });
});

describe("monthlyConsumption", () => {
  it("распределяет расход интервала по месяцам пропорционально дням", () => {
    const readings = [
      { reading: 0, read_at: "2026-05-16" },
      { reading: 300, read_at: "2026-06-15" },
    ];
    const rows = monthlyConsumption(readings, 3, new Date(2026, 6, 1));
    const may = rows.find((r) => r.month === "2026-05")!;
    const jun = rows.find((r) => r.month === "2026-06")!;
    expect(may.consumption + jun.consumption).toBeCloseTo(300, 1);
    // 30 дней интервала: 16 в мае (16–31 мая), 14 в июне.
    expect(may.consumption).toBe(160);
    expect(jun.consumption).toBe(140);
  });
});
