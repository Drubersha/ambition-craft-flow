import { describe, expect, it } from "vitest";
import { passwordIssues, PASSWORD_MIN } from "./account.functions";

describe("passwordIssues", () => {
  it("accepts a password with letters and digits of sufficient length", () => {
    expect(passwordIssues("test-password-123")).toEqual([]);
    expect(passwordIssues("пароль123")).toEqual([]);
  });

  it("rejects short passwords", () => {
    expect(passwordIssues("a1")).toContain(`минимум ${PASSWORD_MIN} символов`);
  });

  it("requires at least one letter", () => {
    expect(passwordIssues("12345678")).toContain("хотя бы одна буква");
  });

  it("requires at least one digit", () => {
    expect(passwordIssues("passwordonly")).toContain("хотя бы одна цифра");
  });

  it("collects multiple issues at once", () => {
    expect(passwordIssues("-")).toHaveLength(3);
  });
});
