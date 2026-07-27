/**
 * Чат ИИ-ассистента по данным программы.
 *
 * Схема работы в три шага: модель выбирает инструмент → код считает и
 * собирает ссылки → модель формулирует ответ по готовой выжимке. Цифры
 * никогда не приходят из модели, поэтому ошибиться в них она не может.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowedOwnerIds } from "@/lib/auth-roles.server";
import { AI_TOOLS, runAiTool, type AiLink } from "@/lib/ai-tools.server";
import {
  buildDialogContext,
  DIALOG_CONTEXT_LIMIT,
  fallbackPlan,
  looksRussian,
  matchTenantName,
  mergeWithPreviousPlan,
  PlanSchema,
  refinePlanForTenant,
  type AiPlan,
} from "@/lib/ai-intent";
import { matchHelpTopic } from "@/lib/ai-help";

const AskInput = z.object({
  question: z.string().min(1).max(500),
});

/** Сколько последних сообщений показываем при открытии чата. */
const HISTORY_LIMIT = 100;

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

    // Шаг 0. Вопросы про методику дашборда («почему дебиторка и просроченные —
    // разные цифры») получают заготовленный ответ из справки: модель методики
    // не знает и начала бы сочинять. Если в вопросе назван арендатор, это
    // запрос данных — справка не вмешивается.
    const { data: tenantRowsEarly } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .in("owner_id", ownerIds);
    const knownNames = (tenantRowsEarly ?? []).map((t: any) => t.name as string);
    const helpTopic = matchTenantName(data.question, knownNames)
      ? null
      : matchHelpTopic(data.question);
    if (helpTopic) {
      try {
        // links NOT NULL в схеме: без явного [] у строки вопроса падала вся
        // пакетная вставка, и переписка молча не сохранялась.
        const { error: saveError } = await supabaseAdmin.from("ai_messages").insert([
          {
            owner_id: ownerIds[0],
            user_id: context.userId,
            role: "user",
            body: data.question,
            links: [],
          },
          {
            owner_id: ownerIds[0],
            user_id: context.userId,
            role: "assistant",
            body: helpTopic.answer,
            links: [],
            facts: `Справка: ${helpTopic.title}`,
            tool: "help_faq",
            plan: null,
          },
        ]);
        if (saveError) console.error("[askAi] history save error", saveError);
      } catch (e) {
        console.error("[askAi] history save threw", e);
      }
      return {
        ok: true as const,
        answer: helpTopic.answer,
        links: [] as AiLink[],
        tool: "help_faq",
        // Готовый ответ справки — модель не нужна, деградации нет.
        modelUsed: true,
        facts: `Справка: ${helpTopic.title}`,
      };
    }

    // Контекст диалога: последние сообщения (вопросы вместе с ответами) видят
    // и маршрутизатор, и формулировка — «а за май?» опирается именно на них.
    const { data: histRows } = await supabaseAdmin
      .from("ai_messages")
      .select("role, body")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(DIALOG_CONTEXT_LIMIT);
    const dialog = buildDialogContext((histRows ?? []).reverse());

    // Шаг 1. Выбор инструмента.
    let plan: AiPlan = fallbackPlan(data.question);
    let modelUsed = false;
    if (gateway) {
      try {
        // Строгий structured output ollama выдаёт нестабильно
        // (AI_NoObjectGeneratedError), поэтому просим JSON текстом и разбираем
        // сами: невалидный ответ просто оставляет план от эвристики.
        const res = await generateText({
          model: gateway.chatModel(getAiModelName()),
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "Ты — маршрутизатор запросов в системе учёта аренды. Верни ТОЛЬКО JSON без пояснений " +
                'в формате {"tool":"имя","tenant":"","period":""} — tenant и period заполняй, ' +
                "только если они прямо названы в вопросе или однозначно следуют из предыдущих реплик, " +
                "иначе оставляй пустыми.\n" +
                `Доступные инструменты:\n${TOOL_LIST}`,
            },
            ...dialog,
            { role: "user", content: data.question },
          ],
        });
        const raw = res.text?.match(/\{[\s\S]*\}/)?.[0];
        if (raw) {
          const json = JSON.parse(raw);
          // Пустые строки модель ставит охотно — они не должны затирать эвристику.
          for (const k of ["tenant", "period", "query"]) {
            if (!json[k]) delete json[k];
          }
          const parsed = PlanSchema.safeParse(json);
          if (parsed.success) {
            plan = parsed.data;
            modelUsed = true;
          }
        }
      } catch (e) {
        console.error("[askAi] plan error", e);
      }
    }

    // Имя арендатора ищем по справочнику (загружен на шаге 0), а не доверяем
    // модели: она часто опускает его, и вопрос «доход от АРТстроя»
    // превращался в доход по всем.
    const detected = matchTenantName(data.question, knownNames);
    // Если арендатор назван, а инструмент считает по всему портфелю, ответ был
    // бы итогом по всем — переключаемся на сводку по этому арендатору.
    plan = refinePlanForTenant(plan, detected);

    // Уточнение вроде «а средняя» опирается на предыдущий вопрос: достраиваем
    // план контекстом последнего ответа помощника.
    const { data: prevRows } = await supabaseAdmin
      .from("ai_messages")
      .select("plan")
      .eq("user_id", context.userId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1);
    const prevPlan = (prevRows?.[0]?.plan ?? null) as AiPlan | null;
    plan = mergeWithPreviousPlan(plan, data.question, prevPlan);
    // Наследованный арендатор мог вернуть инструмент, считающий по портфелю.
    plan = refinePlanForTenant(plan, plan.tenant);

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
                "Ты — ассистент по учёту аренды. Перескажи данные как ответ на вопрос. " +
                "Отвечай ТОЛЬКО на русском языке, кратко (1–3 предложения), без списков и markdown. " +
                "ПЕРВОЕ предложение данных — это главный ответ, начни с него. " +
                "Не меняй числа, не меняй имена и не делай собственных выводов. " +
                "Предыдущие реплики даны только для связности — числа бери из свежих данных.",
            },
            ...dialog,
            { role: "user", content: `Вопрос: ${data.question}\n\nДанные: ${result.summary}` },
          ],
        });
        const text = res.text?.trim();
        // Модель иногда срывается на китайский посреди фразы — такой ответ
        // показывать нельзя, выжимка из данных всегда корректна.
        if (text && looksRussian(text)) answer = text;
        else if (text) console.error("[askAi] ответ не на русском, показываю выжимку:", text);
      } catch (e) {
        console.error("[askAi] answer error", e);
      }
    }

    // Сохраняем переписку: чат должен пережить перезагрузку страницы.
    // Ответ пользователю важнее истории, поэтому сбой записи только логируем —
    // но именно логируем: supabase-js не бросает исключений, он возвращает
    // { error }, и раньше молчаливый 404 от PostgREST стоил часов поисков.
    try {
      const { error: saveError } = await supabaseAdmin.from("ai_messages").insert([
        {
          owner_id: ownerIds[0],
          user_id: context.userId,
          role: "user",
          body: data.question,
          // links NOT NULL: без явного [] падала вся пакетная вставка.
          links: [],
        },
        {
          owner_id: ownerIds[0],
          user_id: context.userId,
          role: "assistant",
          body: answer,
          links: result.links,
          facts: result.summary,
          tool: plan.tool,
          plan,
        },
      ]);
      if (saveError) console.error("[askAi] history save error", saveError);
    } catch (e) {
      console.error("[askAi] history save threw", e);
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

/** История переписки текущего пользователя, старые сообщения — первыми. */
export const getAiHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_messages")
      .select("id, role, body, links, facts, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) console.error("[getAiHistory] error", error);
    return (data ?? []).reverse().map((m: any) => ({
      id: m.id as string,
      role: m.role as "user" | "assistant",
      text: m.body as string,
      links: (m.links ?? []) as AiLink[],
      facts: (m.facts ?? undefined) as string | undefined,
      createdAt: m.created_at as string,
    }));
  });

/** Очистка переписки — по кнопке в интерфейсе. */
export const clearAiHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ai_messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
