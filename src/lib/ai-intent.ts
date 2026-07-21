/**
 * Разбор намерения вопроса: список инструментов, схема плана и запасной
 * выбор по ключевым словам. Чистый модуль без обращений к БД и модели —
 * поэтому покрыт тестами и переиспользуется на сервере.
 */
import { z } from "zod";

export const AI_TOOL_NAMES = [
  "tenant_debts",
  "tenant_overview",
  "income_for_period",
  "unpaid_charges",
  "expiring_contracts",
  "portfolio_overview",
  "find_entity",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

/**
 * Инструменты, считающие по всему портфелю: фильтра по арендатору у них нет.
 * Если в вопросе назван арендатор, отвечать ими нельзя — получится итог по
 * всем («сколько метров занимает Профритейл» → площадь всех помещений).
 */
const PORTFOLIO_WIDE_TOOLS = new Set<string>(["portfolio_overview", "find_entity"]);

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

/**
 * Подставляет найденного арендатора в план и, если выбранный инструмент
 * считает по всему портфелю, переключает на сводку по этому арендатору.
 */
export function refinePlanForTenant(plan: AiPlan, detectedTenant?: string): AiPlan {
  if (!detectedTenant) return plan;
  const next: AiPlan = { ...plan, tenant: detectedTenant };
  if (PORTFOLIO_WIDE_TOOLS.has(plan.tool)) next.tool = "tenant_overview";
  return next;
}

/** Слова организационных форм — по ним арендатора не опознать. */
const NAME_STOPWORDS = new Set(["ооо", "ип", "оао", "зао", "пао", "ао", "и", "п", "физ", "лицо"]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Основа слова для сравнения с падежными формами: «артстрой» и «артстроя»
 * дают общее начало «артстр». Короткие слова не обрезаем — у них и так нет
 * запаса, а ложные совпадения дороже пропуска.
 */
function stem(word: string): string {
  if (word.length >= 6) return word.slice(0, word.length - 2);
  if (word.length === 5) return word.slice(0, 4);
  return word;
}

/**
 * Ищет в вопросе название арендатора из справочника. Нужен потому, что
 * модель часто не выделяет имя (и тогда «доход от АРТстроя» превращается в
 * доход по всем), а падежи не дают сравнивать строки напрямую.
 *
 * Возвращает исходное название или undefined, если совпадений нет.
 */
export function matchTenantName(question: string, names: string[]): string | undefined {
  const q = normalize(question);
  if (!q) return undefined;
  const qWords = new Set(q.split(" "));
  let best: { name: string; score: number } | undefined;

  for (const name of names) {
    const words = normalize(name)
      .split(" ")
      .filter((w) => w.length > 1 && !NAME_STOPWORDS.has(w));
    let score = 0;
    for (const w of words) {
      if (w.length <= 3) {
        // Короткое слово («ИТК») засчитываем только как отдельное слово вопроса.
        if (qWords.has(w)) score += w.length;
        continue;
      }
      const root = stem(w);
      if (root.length >= 4 && q.includes(root)) score += root.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { name, score };
  }
  return best?.name;
}
