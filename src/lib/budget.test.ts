import { describe, expect, it } from "vitest";
import { getCurrentPeriod, listSelectablePeriods } from "./budget";

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
