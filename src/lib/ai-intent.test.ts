import { describe, expect, it } from "vitest";
import { AI_TOOL_NAMES, fallbackPlan, matchTenantName, PlanSchema } from "./ai-intent";

describe("fallbackPlan", () => {
  const cases: [string, string][] = [
    ["Кто больше всех должен?", "tenant_debts"],
    ["Покажи задолженность арендаторов", "tenant_debts"],
    ["Кто не платит?", "tenant_debts"],
    ["Какая дебиторка?", "tenant_debts"],
    ["Какие договоры скоро истекают?", "expiring_contracts"],
    ["Что заканчивается в этом квартале", "expiring_contracts"],
    ["Какой доход за июнь?", "income_for_period"],
    ["Сколько денег поступило в мае", "income_for_period"],
    ["Какая выручка за год", "income_for_period"],
    ["Какие начисления просрочены", "unpaid_charges"],
    ["Что не оплачено", "unpaid_charges"],
    ["Какая занятость по контурам?", "portfolio_overview"],
    ["Сколько площади свободно", "portfolio_overview"],
    ["Какая средняя ставка", "portfolio_overview"],
  ];

  it.each(cases)("вопрос «%s» → %s", (question, tool) => {
    expect(fallbackPlan(question).tool).toBe(tool);
  });

  it("незнакомый вопрос уходит в поиск с исходным текстом", () => {
    const plan = fallbackPlan("ИТК Авто");
    expect(plan.tool).toBe("find_entity");
    expect(plan.query).toBe("ИТК Авто");
  });

  it("для дохода прокидывает период из вопроса", () => {
    expect(fallbackPlan("доход за июнь 2026").period).toBe("доход за июнь 2026");
  });

  it("не зависит от регистра и буквы ё", () => {
    expect(fallbackPlan("СКОЛЬКО ДОЛГА?").tool).toBe("tenant_debts");
    expect(fallbackPlan("Какие счёта не оплачены").tool).toBe("unpaid_charges");
  });

  it("всегда возвращает существующий инструмент", () => {
    for (const [q] of cases) {
      expect(AI_TOOL_NAMES).toContain(fallbackPlan(q).tool);
    }
    expect(PlanSchema.safeParse(fallbackPlan("что угодно")).success).toBe(true);
  });
});

describe("matchTenantName", () => {
  // Реальные названия из базы — на них и ошибался помощник.
  const NAMES = [
    "АРТстрой ООО",
    "ИТК Авто ООО",
    "ПромВторРесурс ООО",
    "МебельКом ООО",
    "Шелф Групп ООО",
    "ТХП ООО",
    "Марченко Мария Валерьевна ИП",
    "Галкин Алексей Валерьевич",
    "КЗС Групп ООО",
  ];

  it("узнаёт название в родительном падеже", () => {
    expect(matchTenantName("какой доход от артстроя за июнь", NAMES)).toBe("АРТстрой ООО");
    expect(matchTenantName("сколько заплатил промвторресурс", NAMES)).toBe("ПромВторРесурс ООО");
    expect(matchTenantName("платежи мебелькома", NAMES)).toBe("МебельКом ООО");
  });

  it("узнаёт по фамилии", () => {
    expect(matchTenantName("долг марченко", NAMES)).toBe("Марченко Мария Валерьевна ИП");
    expect(matchTenantName("сколько должен галкин", NAMES)).toBe("Галкин Алексей Валерьевич");
  });

  it("узнаёт короткие аббревиатуры как отдельные слова", () => {
    expect(matchTenantName("сколько должен ИТК Авто", NAMES)).toBe("ИТК Авто ООО");
    expect(matchTenantName("долг ТХП", NAMES)).toBe("ТХП ООО");
  });

  it("не срабатывает на вопросах без имени", () => {
    expect(matchTenantName("кто больше всех должен?", NAMES)).toBeUndefined();
    expect(matchTenantName("какой доход за июнь", NAMES)).toBeUndefined();
    expect(matchTenantName("какая занятость по контурам", NAMES)).toBeUndefined();
    expect(matchTenantName("", NAMES)).toBeUndefined();
  });

  it("выбирает более полное совпадение при пересечении слов", () => {
    // «Групп» есть у двух арендаторов — решает уникальное слово.
    expect(matchTenantName("доход шелф групп", NAMES)).toBe("Шелф Групп ООО");
    expect(matchTenantName("доход кзс групп", NAMES)).toBe("КЗС Групп ООО");
  });

  it("не зависит от регистра и знаков препинания", () => {
    expect(matchTenantName("ДОХОД ОТ «АРТСТРОЙ», июнь!", NAMES)).toBe("АРТстрой ООО");
  });
});
