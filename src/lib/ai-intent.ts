/**
 * Разбор намерения вопроса: список инструментов, схема плана и запасной
 * выбор по ключевым словам. Чистый модуль без обращений к БД и модели —
 * поэтому покрыт тестами и переиспользуется на сервере.
 */
import { z } from "zod";

export const AI_TOOL_NAMES = [
  "tenant_debts",
  "income_for_period",
  "unpaid_charges",
  "expiring_contracts",
  "portfolio_overview",
  "find_entity",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

/** Плоская схема: вложенные объекты небольшая модель заполняет заметно хуже. */
export const PlanSchema = z.object({
  tool: z.enum(AI_TOOL_NAMES).describe("Какой инструмент отвечает на вопрос"),
  tenant: z.string().optional().describe("Название арендатора, если упомянут"),
  period: z.string().optional().describe("Период словами, если упомянут"),
  days: z.number().int().optional(),
  limit: z.number().int().optional(),
  query: z.string().optional().describe("Строка поиска для find_entity"),
});

export type AiPlan = z.infer<typeof PlanSchema>;

/**
 * Запасной выбор инструмента по ключевым словам — работает, когда модель
 * недоступна или вернула мусор. Порядок проверок важен: более специфичные
 * формулировки идут раньше общих.
 */
export function fallbackPlan(question: string): AiPlan {
  const q = question.toLowerCase().replace(/ё/g, "е");
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("истек", "заканчива", "продлен", "закончит", "истеч")) {
    return { tool: "expiring_contracts" };
  }
  // «долж» покрывает и «должен», и «должник»; «должн» не подошло бы к «должен».
  if (has("долг", "задолж", "долж", "не плат", "неплат", "дебитор")) {
    return { tool: "tenant_debts" };
  }
  // «оплач», а не «оплат»: в слове «оплачено» после «опла» идёт «ч».
  if (has("начислен", "счет", "просроч", "неоплач", "не оплач")) {
    return { tool: "unpaid_charges" };
  }
  if (has("доход", "выручк", "поступил", "заплат", "платеж", "оплат", "денег", "собрал")) {
    return { tool: "income_for_period", period: question };
  }
  if (has("площад", "занят", "вакант", "сдано", "свободн", "портфел", "ставк", "контур")) {
    return { tool: "portfolio_overview" };
  }
  return { tool: "find_entity", query: question };
}
