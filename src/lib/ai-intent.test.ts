import { describe, expect, it } from "vitest";
import { buildDialogContext } from "./ai-intent";

describe("buildDialogContext", () => {
  const row = (role: string, body: string | null) => ({ role, body });

  it("берёт не больше лимита последних сообщений в исходном порядке", () => {
    const rows = Array.from({ length: 14 }, (_, i) =>
      row(i % 2 ? "assistant" : "user", `сообщение ${i + 1}`),
    );
    const ctx = buildDialogContext(rows);
    expect(ctx).toHaveLength(10);
    expect(ctx[0].content).toBe("сообщение 5");
    expect(ctx[9].content).toBe("сообщение 14");
    expect(ctx[9].role).toBe("assistant");
  });

  it("усекает длинные ответы и выбрасывает пустые", () => {
    const long = "а".repeat(500);
    const ctx = buildDialogContext([row("assistant", long), row("user", "  "), row("user", null)]);
    expect(ctx).toHaveLength(1);
    expect(ctx[0].content).toHaveLength(301); // 300 + многоточие
  });

  it("пустая история — пустой контекст", () => {
    expect(buildDialogContext([])).toEqual([]);
  });
});
import {
  AI_TOOL_NAMES,
  fallbackPlan,
  isFollowUp,
  looksRussian,
  matchTenantName,
  mergeWithPreviousPlan,
  PlanSchema,
  refinePlanForTenant,
  resolvePeriod,
} from "./ai-intent";

describe("fallbackPlan", () => {
  const cases: [string, string][] = [
    // Прибыль и выручка — разные понятия: прибыль идёт своему инструменту,
    // включая частую опечатку «прибль».
    ["какая прибль за год", "profit_for_period"],
    ["какая прибыль за июнь", "profit_for_period"],
    ["сколько заработали в этом месяце", "profit_for_period"],
    ["какая выручка за год", "income_for_period"],
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

  it("узнаёт ПРОФРИТЕЙЛ — на нём помощник отвечал площадью всех помещений", () => {
    const names = [...NAMES, "ПРОФРИТЕЙЛ ООО"];
    expect(matchTenantName("сколько метров помещения занимает профритейл", names)).toBe(
      "ПРОФРИТЕЙЛ ООО",
    );
  });
});

describe("refinePlanForTenant", () => {
  it("переключает общий портфель на сводку по арендатору", () => {
    // Именно этот случай давал «13 135 м²» вместо площади арендатора.
    const plan = refinePlanForTenant({ tool: "portfolio_overview" }, "ПРОФРИТЕЙЛ ООО");
    expect(plan.tool).toBe("tenant_overview");
    expect(plan.tenant).toBe("ПРОФРИТЕЙЛ ООО");
  });

  it("поиск с распознанным арендатором тоже становится сводкой", () => {
    expect(refinePlanForTenant({ tool: "find_entity", query: "х" }, "ТХП ООО").tool).toBe(
      "tenant_overview",
    );
  });

  it("инструменты с фильтром по арендатору остаются на месте", () => {
    for (const tool of ["tenant_debts", "income_for_period", "unpaid_charges"] as const) {
      const plan = refinePlanForTenant({ tool }, "АРТстрой ООО");
      expect(plan.tool).toBe(tool);
      expect(plan.tenant).toBe("АРТстрой ООО");
    }
  });

  it("без распознанного арендатора план не меняется", () => {
    const original = { tool: "portfolio_overview" } as const;
    expect(refinePlanForTenant(original, undefined)).toEqual(original);
  });

  it("все инструменты плана существуют", () => {
    expect(AI_TOOL_NAMES).toContain(
      refinePlanForTenant({ tool: "portfolio_overview" }, "ТХП ООО").tool,
    );
    expect(
      PlanSchema.safeParse(refinePlanForTenant({ tool: "find_entity" }, "ТХП ООО")).success,
    ).toBe(true);
  });
});

describe("isFollowUp", () => {
  it("узнаёт уточнения", () => {
    expect(isFollowUp("а средняя")).toBe(true);
    expect(isFollowUp("А за май?")).toBe(true);
    expect(isFollowUp("и долг")).toBe(true);
    expect(isFollowUp("за июнь")).toBe(true);
  });

  it("самостоятельные вопросы уточнениями не считает", () => {
    expect(isFollowUp("какой доход за июнь?")).toBe(false);
    expect(isFollowUp("кто больше всех должен?")).toBe(false);
    expect(isFollowUp("")).toBe(false);
  });
});

describe("mergeWithPreviousPlan", () => {
  const prev = { tool: "tenant_overview", tenant: "Шелф Групп ООО" } as const;

  it("«а средняя» продолжает разговор о том же арендаторе", () => {
    // Ровно тот случай: после «какая ставка у шелф групп» помощник терял контекст.
    const plan = mergeWithPreviousPlan(fallbackPlan("а средняя"), "а средняя", prev);
    expect(plan.tenant).toBe("Шелф Групп ООО");
    expect(plan.tool).toBe("portfolio_overview");
  });

  it("нераспознанное уточнение берёт прошлый инструмент", () => {
    const plan = mergeWithPreviousPlan(
      { tool: "find_entity", query: "а по офису" },
      "а по офису",
      prev,
    );
    expect(plan.tool).toBe("tenant_overview");
    expect(plan.tenant).toBe("Шелф Групп ООО");
  });

  it("наследует период уточнения", () => {
    const previous = { tool: "income_for_period", tenant: "ТХП ООО", period: "май 2026" } as const;
    const plan = mergeWithPreviousPlan({ tool: "tenant_debts" }, "а долг", previous);
    expect(plan.tenant).toBe("ТХП ООО");
    expect(plan.period).toBe("май 2026");
  });

  it("самостоятельный вопрос контекст не подхватывает", () => {
    const plan = mergeWithPreviousPlan(
      fallbackPlan("кто больше всех должен?"),
      "кто больше всех должен?",
      prev,
    );
    expect(plan.tenant).toBeUndefined();
    expect(plan.tool).toBe("tenant_debts");
  });

  it("явно названный арендатор важнее унаследованного", () => {
    const plan = mergeWithPreviousPlan({ tool: "tenant_debts", tenant: "ТХП ООО" }, "а ТХП", prev);
    expect(plan.tenant).toBe("ТХП ООО");
  });

  it("без истории план не меняется", () => {
    const original = fallbackPlan("а средняя");
    expect(mergeWithPreviousPlan(original, "а средняя", null)).toEqual(original);
  });
});

describe("resolvePeriod", () => {
  // 21 июля 2026 — день, когда помощник ответил про июль вместо июня.
  const TODAY = new Date(2026, 6, 21);

  it("«прошлый месяц» — это июнь, а не текущий июль", () => {
    expect(resolvePeriod("прошлый месяц", undefined, undefined, TODAY)).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(resolvePeriod("за предыдущий месяц", undefined, undefined, TODAY).from).toBe(
      "2026-06-01",
    );
  });

  it("по умолчанию берёт текущий месяц", () => {
    expect(resolvePeriod(undefined, undefined, undefined, TODAY)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(resolvePeriod("за этот месяц", undefined, undefined, TODAY).from).toBe("2026-07-01");
  });

  it("понимает названия месяцев в любом падеже", () => {
    expect(resolvePeriod("доход за июнь", undefined, undefined, TODAY)).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(resolvePeriod("за февраля 2026", undefined, undefined, TODAY)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(resolvePeriod("в марте", undefined, undefined, TODAY).from).toBe("2026-03-01");
    expect(resolvePeriod("за май", undefined, undefined, TODAY).from).toBe("2026-05-01");
  });

  it("названный месяц важнее слова «прошлый»", () => {
    expect(resolvePeriod("за прошлый январь", undefined, undefined, TODAY).from).toBe("2026-01-01");
  });

  it("считает годы и кварталы", () => {
    expect(resolvePeriod("за год", undefined, undefined, TODAY)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(resolvePeriod("за прошлый год", undefined, undefined, TODAY)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(resolvePeriod("за квартал", undefined, undefined, TODAY)).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(resolvePeriod("за прошлый квартал", undefined, undefined, TODAY)).toEqual({
      from: "2026-04-01",
      to: "2026-06-30",
    });
  });

  it("явные даты важнее любых слов", () => {
    expect(resolvePeriod("прошлый месяц", "2026-01-05", "2026-01-09", TODAY)).toEqual({
      from: "2026-01-05",
      to: "2026-01-09",
    });
  });
});

describe("looksRussian", () => {
  it("отклоняет ответ со срывом на китайский", () => {
    // Реальный ответ помощника: начался по-русски, закончился иероглифами.
    expect(
      looksRussian(
        "Доход за июль составил 0 рублей, так как期间的租金收入为0元。没有收到任何付款。",
      ),
    ).toBe(false);
    expect(looksRussian("租金收入为0元")).toBe(false);
  });

  it("принимает нормальный русский ответ", () => {
    expect(looksRussian("Доход от «ИТК Авто ООО» за июнь 2026 составил 242 448,00 ₽.")).toBe(true);
    expect(looksRussian("Больше всех должен ИТК Авто — 1 635 512,24 ₽.")).toBe(true);
  });

  it("не придирается к цифрам, латинским сокращениям и пустоте", () => {
    expect(looksRussian("242 448,00 ₽")).toBe(true);
    expect(looksRussian("Договор №ЭВ/2 026/0713 — 164.4 м²")).toBe(true);
    expect(looksRussian("")).toBe(false);
  });
});
