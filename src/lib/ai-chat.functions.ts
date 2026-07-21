/**
 * Чат ИИ-ассистента по данным программы.
 *
 * Схема работы в три шага: модель выбирает инструмент → код считает и
 * собирает ссылки → модель формулирует ответ по готовой выжимке. Цифры
 * никогда не приходят из модели, поэтому ошибиться в них она не может.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_TOOLS, runAiTool, type AiLink } from "@/lib/ai-tools.server";
import {
  fallbackPlan,
  matchTenantName,
  PlanSchema,
  refinePlanForTenant,
  type AiPlan,
} from "@/lib/ai-intent";

const AskInput = z.object({
  question: z.string().min(1).max(500),
});

/** Owner ids, к данным которых у пользователя есть доступ. */
async function allowedOwnerIds(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_links")
    .select("owner_user_id")
    .eq("member_user_id", userId)
    .eq("role", "manager");
  const ids = new Set<string>([userId]);
  (data ?? []).forEach((r: any) => ids.add(r.owner_user_id));
  return Array.from(ids);
}

const TOOL_LIST = Object.entries(AI_TOOLS)
  .map(([name, t]) => `- ${name}: ${t.description}`)
  .join("\n");

export const askAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AskInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createAiProvider, getAiModelName } = await import("./ai-gateway.server");
    const gateway = createAiProvider();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerIds = await allowedOwnerIds(context.supabase, context.userId);
    const ctx = { sb: supabaseAdmin, ownerIds };

    // Шаг 1. Выбор инструмента.
    let plan: AiPlan = fallbackPlan(data.question);
    let modelUsed = false;
    if (gateway) {
      try {
        const res = await generateText({
          model: gateway.chatModel(getAiModelName()),
          experimental_output: Output.object({ schema: PlanSchema }),
          messages: [
            {
              role: "system",
              content:
                "Ты — маршрутизатор запросов в системе учёта аренды. Выбери подходящий инструмент " +
                "и извлеки параметры из вопроса. Отвечай только структурой, ничего не придумывай.\n" +
                `Доступные инструменты:\n${TOOL_LIST}`,
            },
            { role: "user", content: data.question },
          ],
        });
        const out = (res as { experimental_output?: AiPlan }).experimental_output;
        if (out?.tool) {
          plan = out;
          modelUsed = true;
        }
      } catch (e) {
        console.error("[askAi] plan error", e);
      }
    }

    // Имя арендатора ищем по справочнику, а не доверяем модели: она часто
    // опускает его, и вопрос «доход от АРТстроя» превращался в доход по всем.
    const { data: tenantRows } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .in("owner_id", ownerIds);
    const knownNames = (tenantRows ?? []).map((t: any) => t.name as string);
    const detected = matchTenantName(data.question, knownNames);
    // Если арендатор назван, а инструмент считает по всему портфелю, ответ был
    // бы итогом по всем — переключаемся на сводку по этому арендатору.
    plan = refinePlanForTenant(plan, detected);

    // Шаг 2. Считает код — модель к цифрам не притрагивается.
    const args: Record<string, unknown> = {};
    if (plan.tenant) args.tenant = plan.tenant;
    if (plan.period) args.period = plan.period;
    if (typeof plan.days === "number") args.days = plan.days;
    if (typeof plan.limit === "number") args.limit = plan.limit;
    if (plan.query) args.query = plan.query;
    if (plan.tool === "find_entity" && !args.query) args.query = data.question;

    let result;
    try {
      result = await runAiTool(plan.tool, args, ctx);
    } catch (e) {
      console.error("[askAi] tool error", e);
      return {
        ok: false as const,
        answer: "Не удалось получить данные — попробуйте переформулировать вопрос.",
        links: [] as AiLink[],
        tool: plan.tool,
      };
    }

    // Шаг 3. Формулировка. Если модели нет или она молчит — отдаём выжимку как есть.
    let answer = result.summary;
    if (gateway && result.links.length >= 0) {
      try {
        const res = await generateText({
          model: gateway.chatModel(getAiModelName()),
          // Низкая температура: нужен пересказ фактов, а не сочинение.
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Ты — ассистент по учёту аренды. Перескажи данные как ответ на вопрос, по-русски, " +
                "кратко (1–3 предложения), без списков и markdown. " +
                "ПЕРВОЕ предложение данных — это главный ответ, начни с него. " +
                "Не меняй числа, не меняй имена и не делай собственных выводов.",
            },
            { role: "user", content: `Вопрос: ${data.question}\n\nДанные: ${result.summary}` },
          ],
        });
        const text = res.text?.trim();
        if (text) answer = text;
      } catch (e) {
        console.error("[askAi] answer error", e);
      }
    }

    return {
      ok: true as const,
      answer,
      links: result.links,
      tool: plan.tool,
      /** false — сработал запасной выбор по ключевым словам (модель недоступна). */
      modelUsed,
      /** Выжимка из данных: показывается, если формулировка модели разошлась с фактами. */
      facts: result.summary,
    };
  });
