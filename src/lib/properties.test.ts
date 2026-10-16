import { describe, expect, it } from "vitest";
import { propertyRowFromForm } from "./properties";
import type { PropertyFormValues } from "@/components/property-form";

const base: PropertyFormValues = {
  name: "Офис 101",
  address: "Казань, Хлебозаводская 7",
  type: "office",
  cadastral_no: "",
  area_total: "",
  area_usable: "",
  floor: "",
  room_no: "",
  status: "free",
  base_rate: "",
  currency: "",
  description: "",
  folder_id: null,
};

describe("propertyRowFromForm", () => {
  it("пустые поля → null, площадь → 0, валюта → RUB", () => {
    const row = propertyRowFromForm(base);
    expect(row.cadastral_no).toBeNull();
    expect(row.floor).toBeNull();
    expect(row.room_no).toBeNull();
    expect(row.description).toBeNull();
    expect(row.area_total).toBe(0);
    expect(row.area_usable).toBeNull();
    expect(row.base_rate).toBeNull();
    expect(row.currency).toBe("RUB");
    expect(row.folder_id).toBeNull();
  });

  it("числа приводит к числам, текст обрезает, enum и папку сохраняет", () => {
    const row = propertyRowFromForm({
      ...base,
      area_total: "120.5",
      area_usable: "100",
      base_rate: "950",
      floor: " 2 ",
      currency: "USD",
      folder_id: "f1",
    });
    expect(row.area_total).toBe(120.5);
    expect(row.area_usable).toBe(100);
    expect(row.base_rate).toBe(950);
    expect(row.floor).toBe("2");
    expect(row.currency).toBe("USD");
    expect(row.type).toBe("office");
    expect(row.status).toBe("free");
    expect(row.folder_id).toBe("f1");
  });
});
