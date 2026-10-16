import { describe, expect, it } from "vitest";
import { tenantContactRowFromForm } from "./tenants";

describe("tenantContactRowFromForm", () => {
  it("обрезает пробелы, пустые email/phone → null, порядок сохраняет", () => {
    const row = tenantContactRowFromForm(
      { full_name: " Иванов И. И. ", email: " ", phone: "+7 900 000-00-00 " },
      2,
    );
    expect(row).toEqual({
      full_name: "Иванов И. И.",
      email: null,
      phone: "+7 900 000-00-00",
      sort_order: 2,
    });
  });
});
