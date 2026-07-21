import { describe, expect, it } from "vitest";
import { getCurrentPeriod, listSelectablePeriods, plannedForMonths } from "./budget";

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
