import { describe, expect, it } from "vitest";
import { humanError } from "./human-error";

describe("humanError", () => {
  it("maps PostgreSQL codes to Russian", () => {
    expect(
      humanError({ code: "23505", message: 'duplicate key value violates unique constraint "x"' }),
    ).toMatch(/уже есть/);
    expect(humanError({ code: "42501", message: "permission denied" })).toMatch(/Нет доступа/);
  });
  it("keeps Russian messages as they are", () => {
    expect(humanError(new Error("Сумма должна быть больше нуля"))).toBe(
      "Сумма должна быть больше нуля",
    );
  });
  it("recognises common English texts", () => {
    expect(humanError(new Error("Invalid login credentials"))).toMatch(/Неверный e-mail/);
    expect(humanError(new TypeError("Failed to fetch"))).toMatch(/Нет связи/);
  });
  it("falls back to the given text for unknown errors", () => {
    expect(humanError(new Error("something odd"), "Не удалось сохранить")).toBe(
      "Не удалось сохранить",
    );
    expect(humanError(undefined)).toBe("Не удалось выполнить действие");
  });
});
