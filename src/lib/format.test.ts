import { describe, it, expect } from "vitest";
import {
  monthlyPayment,
  chargeTotalForPeriod,
  splitContractPeriods,
  monthsInRange,
  computeDepositWithArea,
} from "./format";

describe("monthlyPayment", () => {
  it("monthly: rate * area", () => {
    expect(monthlyPayment(1000, "monthly", 10)).toBe(10000);
  });
  it("quarterly normalizes to monthly", () => {
    expect(monthlyPayment(3000, "quarterly", 2)).toBe(2000);
  });
  it("yearly normalizes to monthly", () => {
    expect(monthlyPayment(12000, "yearly", 1)).toBe(1000);
  });
  it("zero area returns 0", () => {
    expect(monthlyPayment(1000, "monthly", 0)).toBe(0);
  });
});

describe("monthsInRange", () => {
  it("inclusive month count", () => {
    expect(monthsInRange("2024-01-01", "2024-03-15")).toBe(3);
  });
  it("min 1", () => {
    expect(monthsInRange("", "")).toBe(1);
  });
});

describe("chargeTotalForPeriod", () => {
  it("one_time uses rate * area", () => {
    expect(chargeTotalForPeriod(500, "one_time", "2024-01-01", "2024-01-31", 2)).toBe(1000);
  });
  it("monthly multiplies by months", () => {
    expect(chargeTotalForPeriod(1000, "monthly", "2024-01-01", "2024-03-31", 1)).toBe(3000);
  });
  it("yearly normalizes correctly", () => {
    expect(chargeTotalForPeriod(12000, "yearly", "2024-01-01", "2024-02-29", 1)).toBe(2000);
  });
});

describe("computeDepositWithArea", () => {
  it("returns percent of monthly payment", () => {
    expect(computeDepositWithArea(1000, "monthly", 10, 100)).toBe(10000);
    expect(computeDepositWithArea(1000, "monthly", 10, 50)).toBe(5000);
  });
});

describe("splitContractPeriods", () => {
  it("monthly splits across calendar months", () => {
    const out = splitContractPeriods("2024-01-15", "2024-03-10", "monthly", new Date("2024-04-01"));
    expect(out).toEqual([
      { period_start: "2024-01-15", period_end: "2024-01-31" },
      { period_start: "2024-02-01", period_end: "2024-02-29" },
      { period_start: "2024-03-01", period_end: "2024-03-10" },
    ]);
  });
  it("one_time returns a single segment", () => {
    const out = splitContractPeriods(
      "2024-01-15",
      "2024-06-20",
      "one_time",
      new Date("2024-12-31"),
    );
    expect(out).toEqual([{ period_start: "2024-01-15", period_end: "2024-06-20" }]);
  });
  it("returns empty when start is after today and no end", () => {
    const out = splitContractPeriods("2030-01-01", null, "monthly", new Date("2024-01-01"));
    expect(out).toEqual([]);
  });
  it("quarterly creates one segment per calendar quarter", () => {
    const out = splitContractPeriods(
      "2024-01-01",
      "2024-09-30",
      "quarterly",
      new Date("2024-12-31"),
    );
    expect(out.length).toBe(3);
    expect(out[0]).toEqual({ period_start: "2024-01-01", period_end: "2024-03-31" });
    expect(out[2].period_end).toBe("2024-09-30");
  });
});
