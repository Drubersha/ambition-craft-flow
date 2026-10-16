/**
 * Преобразование значений формы объекта в строку таблицы `properties`.
 * Общее для создания и редактирования: набор полей и правила «пусто → null»,
 * «площадь не указана → 0» должны совпадать на обоих путях сохранения
 * (как tenantRowFromForm и contractRowFromForm).
 */
import type { PropertyFormValues } from "@/components/property-form";
import type { Enums } from "@/integrations/supabase/types";
import { DEFAULT_CURRENCY, textOrNull } from "./format";

export function propertyRowFromForm(v: PropertyFormValues) {
  return {
    name: v.name,
    address: v.address,
    type: v.type as Enums<"property_type">,
    status: v.status as Enums<"property_status">,
    cadastral_no: textOrNull(v.cadastral_no),
    area_total: Number(v.area_total) || 0,
    area_usable: v.area_usable ? Number(v.area_usable) : null,
    floor: textOrNull(v.floor),
    room_no: textOrNull(v.room_no),
    base_rate: v.base_rate ? Number(v.base_rate) : null,
    currency: v.currency || DEFAULT_CURRENCY,
    description: textOrNull(v.description),
    folder_id: v.folder_id,
  };
}
