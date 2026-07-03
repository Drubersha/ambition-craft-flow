import { generateText, Output } from "ai";
import { z } from "zod";
import { createAiProvider, getAiModelName } from "./ai-gateway.server";

/**
 * Server-aware limits (all env-tunable). A self-hosted model usually runs on the
 * same box as Postgres + the Supabase stack + this app, often CPU-only. Task
 * analysis is fired automatically for every tenant message, so a burst can spawn
 * many concurrent generations that thrash the CPU and starve the rest of the
 * stack. These knobs keep the AI workload bounded.
 */
function intEnv(name: string, def: number, min: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min ? Math.floor(v) : def;
}
/** Max AI generations running at once in this process. A single-slot local model
 *  serves ~1 at a time anyway; keep this low on a shared/CPU-only server. */
const MAX_CONCURRENCY = intEnv("AI_MAX_CONCURRENCY", 2, 1);
/** Requests allowed to wait for a slot. Beyond this we shed load (fast, instead
 *  of piling unbounded work + memory + open connections). */
const MAX_QUEUE = intEnv("AI_MAX_QUEUE", 32, 0);
/** Per-request wall-clock budget; a stuck/slow generation is aborted so it can't
 *  hold a slot forever (seen: 100s+ tail latencies under load on CPU). */
const TIMEOUT_MS = intEnv("AI_TIMEOUT_MS", 60000, 1000);
/** Cap generated tokens to bound worst-case CPU time per request. */
const MAX_OUTPUT_TOKENS = intEnv("AI_MAX_OUTPUT_TOKENS", 400, 64);
/** SDK-level retries for transient (network/5xx) errors — kept low on purpose so
 *  a failing provider can't multiply load on a constrained server. */
const MAX_RETRIES = intEnv("AI_MAX_RETRIES", 1, 0);
/** The reasoning scratchpad boosts accuracy on borderline messages but roughly
 *  doubles generated tokens (latency). Set AI_REASONING=false on very constrained
 *  servers to trade a little accuracy for ~2x faster, cheaper generations. */
const USE_REASONING = (process.env.AI_REASONING ?? "true").toLowerCase() !== "false";

/**
 * Persisted decision shape. No `.default()`: with native structured outputs, zod
 * defaults become non-required JSON-schema fields and a small grammar-constrained
 * model then emits empty strings. Required fields + `.describe()` (descriptions
 * are sent inside the schema) reliably steer a small self-hosted model.
 */
const decisionShape = {
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
};
export const TaskSchema = z.object(decisionShape);
export type RecognizedTask = z.infer<typeof TaskSchema>;

/** Actual schema sent to the model — a leading reasoning field when enabled. */
const OutputSchema = USE_REASONING
  ? z.object({
      reasoning: z
        .string()
        .describe("Одно короткое предложение (до 15 слов): почему это задача или почему нет."),
      ...decisionShape,
    })
  : z.object(decisionShape);

/** In-process concurrency gate. Returns false when the queue is full (shed load). */
let active = 0;
let pending = 0;
const waiters: Array<() => void> = [];
async function acquireSlot(): Promise<boolean> {
  if (active < MAX_CONCURRENCY) {
    active++;
    return true;
  }
  if (pending >= MAX_QUEUE) return false;
  pending++;
  await new Promise<void>((resolve) => waiters.push(resolve));
  pending--;
  active++;
  return true;
}
function releaseSlot(): void {
  active--;
  waiters.shift()?.();
}

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
  | { ok: false; reason: "no_key" | "ai_error" | "busy"; error?: string };

/**
 * Run task recognition against the configured self-hosted / OpenAI-compatible
 * provider under server-aware limits: a concurrency gate + bounded queue (shed
 * load when overwhelmed), a per-request timeout, a cap on generated tokens, and
 * a low retry count. Uses temperature 0 for consistent, reproducible decisions.
 */
export async function recognizeTask(opts: {
  body: string;
  ctx?: string;
  images?: Uint8Array[];
}): Promise<RecognizeResult> {
  const gateway = createAiProvider();
  if (!gateway) return { ok: false, reason: "no_key" };

  if (!(await acquireSlot())) {
    console.error("[recognizeTask] queue full — shedding request");
    return { ok: false, reason: "busy" };
  }
  try {
    const userContent: Array<
      { type: "text"; text: string } | { type: "image"; image: Uint8Array }
    > = [
      { type: "text", text: buildTaskPromptText(opts.ctx ?? "", opts.body) },
      ...(opts.images ?? []).map((image) => ({ type: "image" as const, image })),
    ];
    const res = await generateText({
      model: gateway.chatModel(getAiModelName()),
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: MAX_RETRIES,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      experimental_output: Output.object({ schema: OutputSchema }),
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
    console.error("[recognizeTask] AI error", e);
    return { ok: false, reason: "ai_error", error: String(e) };
  } finally {
    releaseSlot();
  }
}
