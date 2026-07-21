import { describe, expect, it } from "vitest";
import {
  computeProfitVsPlan,
  getCurrentPeriod,
  listSelectablePeriods,
  plannedForMonths,
} from "./budget";

describe("getCurrentPeriod", () => {
  it("starts this month when today is on/after reset day", () => {
    expect(getCurrentPeriod(5, new Date(2026, 6, 10))).toEqual({
      start: "2026-07-05",
      end: "2026-08-04",
    });
  });
  it("starts previous month when today is before reset day", () => {
    expect(getCurrentPeriod(15, new Date(2026, 6, 10))).toEqual({
      start: "2026-06-15",
      end: "2026-07-14",
    });
  });
});

describe("listSelectablePeriods", () => {
  const today = new Date(2026, 6, 10); // 10.07.2026

  it("returns current + N past periods, newest first", () => {
    const periods = listSelectablePeriods(1, [], 3, today);
    expect(periods.map((p) => p.start)).toEqual([
      "2026-07-01",
      "2026-06-01",
      "2026-05-01",
      "2026-04-01",
    ]);
    expect(periods[1]).toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });

  it("includes periods present in expenses even when boundaries changed", () => {
    const periods = listSelectablePeriods(
      1,
      [{ period_start: "2026-05-15", period_end: "2026-06-14" }],
      2,
      today,
    );
    expect(periods.map((p) => p.start)).toEqual([
      "2026-07-01",
      "2026-06-01",
      "2026-05-15",
      "2026-05-01",
    ]);
  });

  it("does not duplicate computed periods found in expenses", () => {
    const periods = listSelectablePeriods(
      1,
      [{ period_start: "2026-06-01", period_end: "2026-06-30" }],
      2,
      today,
    );
    expect(periods.map((p) => p.start)).toEqual(["2026-07-01", "2026-06-01", "2026-05-01"]);
  });
});

describe("plannedForMonths", () => {
  const cats = [
    { id: "util", limit_amount: 130000 },
    { id: "fot", limit_amount: 296000 },
  ];

  it("берёт помесячный лимит, когда он задан", () => {
    // Коммуналка по отчёту 1С: январь 550 000, февраль 530 000.
    const limits = [
      { category_id: "util", period_start: "2026-01-01", limit_amount: 550000 },
      { category_id: "util", period_start: "2026-02-01", limit_amount: 530000 },
      { category_id: "fot", period_start: "2026-01-01", limit_amount: 218000 },
      { category_id: "fot", period_start: "2026-02-01", limit_amount: 218000 },
    ];
    expect(plannedForMonths(["2026-01", "2026-02"], cats, limits)).toBe(
      550000 + 218000 + 530000 + 218000,
    );
  });

  it("без помесячного лимита берёт базовый лимит категории", () => {
    expect(plannedForMonths(["2026-07"], cats, [])).toBe(130000 + 296000);
  });

  it("смешивает: часть категорий с переопределением, часть без", () => {
    const limits = [{ category_id: "util", period_start: "2026-03-01", limit_amount: 380000 }];
    // коммуналка из переопределения, ФОТ — базовый
    expect(plannedForMonths(["2026-03"], cats, limits)).toBe(380000 + 296000);
  });

  it("нулевой помесячный лимит не подменяется базовым", () => {
    // Статья «Расходы на МЦ инструмент» в июле запланирована нулём — это
    // осознанный ноль, а не отсутствие плана.
    const limits = [{ category_id: "util", period_start: "2026-07-01", limit_amount: 0 }];
    expect(plannedForMonths(["2026-07"], cats, limits)).toBe(0 + 296000);
  });

  it("воспроизводит план января из отчёта 1С — 829 250 ₽", () => {
    const realCats = [
      { id: "fot", limit_amount: 296000 },
      { id: "kanc", limit_amount: 1000 },
      { id: "util", limit_amount: 130000 },
      { id: "mc_mat", limit_amount: 20000 },
      { id: "gsm", limit_amount: 7000 },
      { id: "mc_inst", limit_amount: 0 },
      { id: "ohrana", limit_amount: 2450 },
      { id: "transport", limit_amount: 0 },
      { id: "svyaz", limit_amount: 5300 },
      { id: "oborud", limit_amount: 0 },
      { id: "spec", limit_amount: 500 },
      { id: "remont", limit_amount: 25000 },
    ];
    const jan = [
      ["fot", 218000],
      ["kanc", 1000],
      ["util", 550000],
      ["mc_mat", 20000],
      ["gsm", 7000],
      ["mc_inst", 0],
      ["ohrana", 2450],
      ["transport", 0],
      ["svyaz", 5300],
      ["oborud", 0],
      ["spec", 500],
      ["remont", 25000],
    ].map(([id, amount]) => ({
      category_id: id as string,
      period_start: "2026-01-01",
      limit_amount: amount as number,
    }));
    expect(plannedForMonths(["2026-01"], realCats, jan)).toBe(829250);
  });
});

describe("computeProfitVsPlan", () => {
  it("считает прибыль как в отчёте: выручка без НДС минус расходы", () => {
    const r = computeProfitVsPlan({
      revenueGross: 122000,
      expenses: 20000,
      months: 1,
      revenuePlanMonthly: 90000,
      expensePlan: 25000,
      vatRate: 22,
    });
    expect(r.revenueNet).toBeCloseTo(100000, 5);
    expect(r.profit).toBeCloseTo(80000, 5);
    expect(r.profitPlan).toBeCloseTo(65000, 5);
    // 80 000 факт против 65 000 плана
    expect(r.overPlan).toBeCloseTo(15000, 5);
  });

  it("воспроизводит январь 2026 из отчёта 1С", () => {
    // План: выручка 2 295 081,97 − расходы 829 250 = прибыль 1 465 831,97.
    const r = computeProfitVsPlan({
      revenueGross: 3472406.06,
      expenses: 701526.28,
      months: 1,
      revenuePlanMonthly: 2295081.97,
      expensePlan: 829250,
      vatRate: 22,
    });
    expect(r.profitPlan).toBeCloseTo(1465831.97, 2);
    // Факт по 1С — 2 216 189,75; расчёт по ставке 22% даёт близкую величину,
    // расхождение из-за арендаторов без НДС (в отчёте коэффициент 1.19).
    expect(r.profit).toBeGreaterThan(2000000);
    expect(r.overPlan).toBeGreaterThan(0);
  });

  it("масштабирует план выручки на число месяцев периода", () => {
    const r = computeProfitVsPlan({
      revenueGross: 0,
      expenses: 0,
      months: 7,
      revenuePlanMonthly: 2295081.97,
      expensePlan: 4409750,
      vatRate: 22,
    });
    expect(r.revenuePlan).toBeCloseTo(16065573.79, 2);
    expect(r.profitPlan).toBeCloseTo(16065573.79 - 4409750, 2);
  });

  it("без плана выручки не выдумывает прибыль сверх плана", () => {
    const r = computeProfitVsPlan({
      revenueGross: 100000,
      expenses: 30000,
      months: 1,
      revenuePlanMonthly: 0,
      expensePlan: 25000,
      vatRate: 22,
    });
    expect(r.revenuePlan).toBeNull();
    expect(r.profitPlan).toBeNull();
    expect(r.overPlan).toBeNull();
  });

  it("нулевая ставка НДС оставляет выручку как есть", () => {
    const r = computeProfitVsPlan({
      revenueGross: 100000,
      expenses: 0,
      months: 1,
      revenuePlanMonthly: 0,
      expensePlan: 0,
      vatRate: 0,
    });
    expect(r.revenueNet).toBe(100000);
  });
});
