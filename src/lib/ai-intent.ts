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
  if (has("площад", "занят", "вакант", "сдано", "свободн", "портфел", "ставк", "контур", "средн")) {
    return { tool: "portfolio_overview" };
  }
  return { tool: "find_entity", query: question };
}

/**
 * Уточняющая реплика вроде «а средняя» или «а за май»: смысла сама по себе не
 * несёт и опирается на предыдущий вопрос.
 */
export function isFollowUp(question: string): boolean {
  const q = question.trim().toLowerCase().replace(/ё/g, "е");
  if (!q) return false;
  // Граница \b считает кириллицу не-словом, поэтому проверяем пробел явно.
  if (/^(а|и|ну|ок|хорошо)(\s|$)/.test(q)) return true;
  // Короткая реплика без глагола-вопроса тоже читается как уточнение.
  return q.split(/\s+/).length <= 3 && !/\?$/.test(q);
}

/**
 * Достраивает план уточняющего вопроса контекстом предыдущего: арендатор и
 * период переносятся, а если намерение не распозналось — берётся прошлый
 * инструмент. Без этого «а средняя» отвечало бы поиском по слову «средняя».
 */
export function mergeWithPreviousPlan(
  plan: AiPlan,
  question: string,
  previous?: AiPlan | null,
): AiPlan {
  if (!previous || !isFollowUp(question)) return plan;
  const next: AiPlan = { ...plan };
  if (!next.tenant && previous.tenant) next.tenant = previous.tenant;
  if (!next.period && previous.period) next.period = previous.period;
  // find_entity здесь означает «намерение не распознано» — продолжаем прошлую тему.
  if (next.tool === "find_entity") next.tool = previous.tool;
  return next;
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

const MONTHS: Record<string, number> = {
  январ: 0,
  феврал: 1,
  март: 2,
  апрел: 3,
  ма: 4,
  июн: 5,
  июл: 6,
  август: 7,
  сентябр: 8,
  октябр: 9,
  ноябр: 10,
  декабр: 11,
};

/**
 * Границы периода из формулировки вопроса. Понимает «прошлый месяц», «этот
 * год», названия месяцев и явные даты; по умолчанию — текущий месяц.
 *
 * `today` передаётся параметром, иначе функцию нельзя проверить тестами.
 */
export function resolvePeriod(
  period?: string,
  from?: string,
  to?: string,
  today: Date = new Date(),
): { from: string; to: string } {
  if (from && to) return { from, to };
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monthRange = (y: number, m: number) => ({
    from: iso(new Date(y, m, 1)),
    to: iso(new Date(y, m + 1, 0)),
  });

  const p = (period ?? "").toLowerCase().replace(/ё/g, "е").trim();
  const y = today.getFullYear();
  const prev = p.includes("прошл") || p.includes("предыдущ") || p.includes("прошедш");

  const yearMatch = p.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : y;

  // Явно названный месяц важнее слова «прошлый»: «за июнь» — это июнь.
  for (const [root, idx] of Object.entries(MONTHS)) {
    // «ма» подошло бы к «март», поэтому корень проверяем как начало слова.
    const re = new RegExp(`(^|[^а-я])${root}[а-я]*`);
    if (re.test(p)) return monthRange(year, idx);
  }

  if (p.includes("год")) {
    const yy = prev ? year - 1 : year;
    return { from: `${yy}-01-01`, to: `${yy}-12-31` };
  }
  if (p.includes("квартал")) {
    const q = Math.floor(today.getMonth() / 3) - (prev ? 1 : 0);
    const base = new Date(year, q * 3, 1);
    return {
      from: iso(base),
      to: iso(new Date(base.getFullYear(), base.getMonth() + 3, 0)),
    };
  }
  if (p.includes("недел")) {
    const day = (today.getDay() + 6) % 7; // понедельник — начало недели
    const start = new Date(y, today.getMonth(), today.getDate() - day - (prev ? 7 : 0));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { from: iso(start), to: iso(end) };
  }
  // «прошлый месяц» и просто «месяц»/пустая строка.
  return monthRange(y, today.getMonth() - (prev ? 1 : 0));
}

/**
 * Проверяет, что ответ написан по-русски: Qwen под нагрузкой иногда
 * переключается на китайский посреди предложения, и такой ответ показывать
 * нельзя — вместо него берём готовую выжимку из данных.
 */
export function looksRussian(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  // Иероглифы, кана, хангыль — верный признак срыва языка.
  if (/[぀-ヿ㐀-鿿가-힯]/.test(t)) return false;
  const cyrillic = (t.match(/[а-яё]/gi) ?? []).length;
  const letters = (t.match(/[a-zа-яё]/gi) ?? []).length;
  if (letters === 0) return true; // только цифры и знаки — придираться не к чему
  return cyrillic / letters >= 0.5;
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
