import { generateText, Output } from "ai";
import { z } from "zod";
import { createAiProvider, getAiModelName } from "./ai-gateway.server";

/**
 * Structured output for tenant-message task recognition.
 *
 * `reasoning` is an internal scratchpad placed FIRST so the model "thinks" before
 * committing to `is_task` (a cheap accuracy boost for a small self-hosted model).
 * It is never persisted — only `is_task/title/description/priority` are stored.
 */
// NOTE: no `.default()` here. With native structured outputs, zod defaults become
// non-required JSON-schema fields, and a small grammar-constrained model then emits
// empty strings for them. Required fields + `.describe()` (the descriptions are sent
// inside the schema) reliably steer a small self-hosted model to fill each field.
export const TaskSchema = z.object({
  reasoning: z
    .string()
    .describe("Одно короткое предложение (до 15 слов): почему это задача или почему нет."),
  is_task: z.boolean().describe("true, если сообщение требует действия управляющего."),
  title: z
    .string()
    .describe(
      "Краткий заголовок задачи, до 80 символов, на русском, конкретно (например «Течёт кран на кухне»). Если is_task=false — пустая строка.",
    ),
  description: z
    .string()
    .describe("Суть задачи одним предложением. Если is_task=false — пустая строка."),
  priority: z
    .enum(["low", "normal", "high"])
    .describe("Приоритет: high — угроза безопасности/проживанию; low — мелочь; normal — иначе."),
});
export type RecognizedTask = z.infer<typeof TaskSchema>;

/**
 * Build the task-recognition prompt. Explicit decision rules + few-shot examples
 * target the failure modes of small self-hosted models: sarcasm, requests hidden
 * inside gratitude, understated but serious problems, procedural/admin requests,
 * and info questions / data confirmations that must NOT become tasks. Also
 * calibrates priority (safety/habitability = high).
 */
export function buildTaskPromptText(ctx: string, body: string): string {
  return (
    "Ты — ассистент управляющего арендой. По последнему сообщению арендатора " +
    "(и фото, если есть) реши, нужно ли создать задачу для управляющего. " +
    "Пиши строго на русском языке.\n\n" +
    "ЗАДАЧА — всё, что требует действия управляющего: поломка, неисправность, " +
    "заявка на ремонт, просьба, жалоба (в т.ч. на соседей/шум), административный " +
    "или процедурный запрос (расторжение/продление договора, справка, изменение " +
    "условий). Считай это задачей, даже если проблема описана вскользь, с " +
    "сарказмом или иронией, с преуменьшением («не срочно», «мелочь», «пока " +
    "справляюсь») или спрятана внутри благодарности.\n\n" +
    "ВАЖНО: преуменьшение арендатором («не то чтобы проблема», «не срочно») НЕ " +
    "отменяет задачу. Если в сообщении есть любой признак неисправности, поломки " +
    "или опасности (искрит, дымит, течёт, не работает, заедает, ледяная батарея, " +
    "запах газа и т.п.) — это ЗАДАЧА, а признаки опасности означают priority=high.\n\n" +
    "НЕ ЗАДАЧА — простое общение; благодарность без новой просьбы; " +
    "информационный вопрос (часы работы, контакты, как что-то устроено); " +
    "подтверждение или передача данных (отправил оплату, передал показания " +
    "счётчика); уточнение чего-то уже сделанного.\n\n" +
    "Приоритет:\n" +
    "- high — угроза безопасности или проживанию: искрит/дымит проводка, запах " +
    "газа, прорыв или сильная течь, нет отопления зимой, нет воды/электричества, " +
    "не работает лифт, не закрывается входная дверь/замок.\n" +
    "- low — косметика и мелочи без срочности: царапина, перегоревшая лампочка, " +
    "эстетика.\n" +
    "- normal — всё остальное.\n\n" +
    "Сначала кратко порассуждай в поле reasoning, затем заполни решение. " +
    "title — до 80 символов, по-русски, конкретно. Если is_task=false — оставь " +
    "title и description пустыми.\n\n" +
    "Примеры:\n" +
    '1) «Спасибо за ремонт крана! Кстати снова капает под раковиной, но не срочно» → is_task=true, priority=normal, title="Снова течёт под раковиной".\n' +
    "2) «Всё отлично, спасибо, хорошего дня!» → is_task=false.\n" +
    "3) «До скольки работает УК в субботу?» → is_task=false.\n" +
    '4) «Отопление у вас конечно "работает", батарея ледяная» → is_task=true, priority=high, title="Не греет батарея, нет отопления".\n' +
    "5) «Показания за март передал: 04512, всё верно записали?» → is_task=false.\n" +
    '6) «Планирую съезжать, как правильно расторгнуть договор?» → is_task=true, priority=normal, title="Запрос на расторжение договора".\n' +
    '7) «Розетка на кухне искрит, когда включаю чайник» → is_task=true, priority=high, title="Искрит розетка на кухне".\n\n' +
    `Контекст переписки:\n${ctx || "(нет)"}\n\n` +
    `Последнее сообщение арендатора: ${body}`
  );
}

export type RecognizeResult =
  | { ok: true; task: RecognizedTask }
  | { ok: false; reason: "no_key" | "ai_error"; error?: string };

/**
 * Run task recognition against the configured self-hosted / OpenAI-compatible
 * provider. Uses temperature 0 for consistency and retries once on transient
 * failures (a schema-mismatch or empty completion can still happen occasionally).
 */
export async function recognizeTask(opts: {
  body: string;
  ctx?: string;
  images?: Uint8Array[];
}): Promise<RecognizeResult> {
  const gateway = createAiProvider();
  if (!gateway) return { ok: false, reason: "no_key" };

  const userContent: Array<{ type: "text"; text: string } | { type: "image"; image: Uint8Array }> =
    [
      { type: "text", text: buildTaskPromptText(opts.ctx ?? "", opts.body) },
      ...(opts.images ?? []).map((image) => ({ type: "image" as const, image })),
    ];
  const model = gateway.chatModel(getAiModelName());

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await generateText({
        model,
        temperature: 0,
        experimental_output: Output.object({ schema: TaskSchema }),
        messages: [{ role: "user", content: userContent as never }],
      });
      const task = (res as { experimental_output: RecognizedTask }).experimental_output;
      // A recognized task must have a title; fall back to the description or the
      // message itself so a valid suggestion is always created downstream.
      if (task.is_task && !task.title?.trim()) {
        const fallback = (task.description?.trim() || opts.body).replace(/\s+/g, " ").trim();
        task.title = fallback.slice(0, 80);
      }
      return { ok: true, task };
    } catch (e) {
      lastErr = e;
    }
  }
  console.error("[recognizeTask] AI error", lastErr);
  return { ok: false, reason: "ai_error", error: String(lastErr) };
}
