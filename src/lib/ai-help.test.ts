import { describe, expect, it } from "vitest";
import { matchHelpTopic, HELP_ENTRIES } from "./ai-help";

describe("matchHelpTopic", () => {
  it("отвечает на вопросы владельца, с которых началась справка", () => {
    expect(matchHelpTopic("почему процент сдачи больше?")?.id).toBe("occupancy_percent");
    expect(matchHelpTopic("почему арендный доход и месячный платеж это разные цифры")?.id).toBe(
      "income_vs_monthly",
    );
    expect(matchHelpTopic("почему дебиторка и просроченные это разные цифры")?.id).toBe(
      "debt_vs_overdue",
    );
    expect(matchHelpTopic("почему собираемость и ожидаем оплаты это разные цифры")?.id).toBe(
      "collection_rate",
    );
  });

  it("понимает разные формулировки объяснительных вопросов", () => {
    expect(matchHelpTopic("что такое АХЧ")?.id).toBe("ahch");
    expect(matchHelpTopic("почему мы сдали больше 100% земли")?.id).toBe("occupancy_percent");
    expect(matchHelpTopic("чем отличается дебиторка от просроченной задолженности")?.id).toBe(
      "debt_vs_overdue",
    );
    expect(matchHelpTopic("почему собираемость такая маленькая")?.id).toBe("collection_rate");
    expect(matchHelpTopic("почему машиноместа не в квадратных метрах")?.id).toBe("units");
    expect(matchHelpTopic("почему переплата не уменьшает долг")?.id).toBe("overpay");
    expect(matchHelpTopic("что значит не оплачено за текущий месяц")?.id).toBe(
      "current_month_unpaid",
    );
    // Ё нормализуется
    expect(matchHelpTopic("почему всё сдано, а процент занятости больше ста")?.id).toBe(
      "occupancy_percent",
    );
  });

  it("запросы данных не перехватывает", () => {
    expect(matchHelpTopic("какая дебиторка у ИТК")).toBeNull();
    expect(matchHelpTopic("сколько должен АРТстрой")).toBeNull();
    expect(matchHelpTopic("покажи просроченные начисления")).toBeNull();
    expect(matchHelpTopic("доход за июнь")).toBeNull();
    expect(matchHelpTopic("сколько свободных машиномест")).toBeNull();
  });

  it("вопрос не по теме справки уходит инструментам", () => {
    expect(matchHelpTopic("почему не работает выгрузка")).toBeNull();
    expect(matchHelpTopic("почему у нас мало арендаторов")).toBeNull();
  });

  it("у каждой темы есть непустой ответ и хотя бы один триггер", () => {
    for (const e of HELP_ENTRIES) {
      expect(e.answer.length).toBeGreaterThan(80);
      expect(e.triggers.length).toBeGreaterThan(0);
      // Ответ — законченный текст без markdown (UI показывает его как есть).
      expect(e.answer).not.toMatch(/[*#`]/);
    }
  });
});
