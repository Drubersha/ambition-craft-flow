import { describe, expect, it } from "vitest";
import { AI_TOOL_NAMES, fallbackPlan, PlanSchema } from "./ai-intent";

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
