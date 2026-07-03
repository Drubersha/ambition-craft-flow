/**
 * AI task-recognition test & load harness.
 *
 * Exercises the SAME server code path used by `analyzeMessage` in
 * `src/lib/tasks.functions.ts`: it imports `recognizeTask()` from
 * `src/lib/task-recognition.server.ts` (provider from `createAiProvider()`, env
 * AI_BASE_URL / AI_API_KEY / AI_MODEL, `generateText` + structured `TaskSchema`
 * output, the shared prompt, temperature 0 and one retry).
 *
 * It does NOT touch Supabase/DB — those are plain I/O around the AI call and are
 * not the bottleneck. This isolates (1) recognition quality on non-obvious
 * tenant messages and (2) latency under concurrency (5 / 10 / 15 in parallel).
 *
 * Run (with a local OpenAI-compatible model, e.g. ollama):
 *   AI_BASE_URL=http://127.0.0.1:11434/v1 AI_API_KEY=ollama AI_MODEL=qwen2.5:3b \
 *     bun scripts/ai-load-test.ts --mode both --concurrency 1,5,10,15
 */
import { getAiModelName } from "../src/lib/ai-gateway.server";
import { recognizeTask, type RecognizedTask } from "../src/lib/task-recognition.server";

const MODEL = getAiModelName();
if (!process.env.AI_BASE_URL || !process.env.AI_API_KEY) {
  console.error("Set AI_BASE_URL + AI_API_KEY for a self-hosted OpenAI-compatible model.");
  process.exit(1);
}

interface AnalyzeResult {
  ok: boolean;
  ms: number;
  parsed?: RecognizedTask;
  error?: string;
}

// Exercises the real app code path: recognizeTask() from task-recognition.server.
async function analyzeOne(body: string, ctx = ""): Promise<AnalyzeResult> {
  const t0 = performance.now();
  const r = await recognizeTask({ body, ctx });
  return r.ok
    ? { ok: true, ms: performance.now() - t0, parsed: r.task }
    : { ok: false, ms: performance.now() - t0, error: r.error ?? r.reason };
}

// ---- non-obvious / tricky tenant messages ----
// expected = whether a human manager would consider it an actionable task.
interface Case {
  body: string;
  ctx?: string;
  expected: boolean;
  note: string;
}
const CASES: Case[] = [
  {
    body: "Спасибо большое за ремонт крана! Кстати, вчера опять начало капать под раковиной, но это не срочно.",
    expected: true,
    note: "благодарность, маскирующая новую течь (скрытая задача)",
  },
  {
    body: "Всё отлично, спасибо за помощь! Хорошего дня :)",
    expected: false,
    note: "чистая благодарность без задачи",
  },
  {
    body: "А вы не подскажете, до скольки работает управляющая компания в субботу?",
    expected: false,
    note: "информационный вопрос, не задача",
  },
  {
    body: "Ну класс, батарея опять ледяная, отопление у вас конечно 'работает'.",
    expected: true,
    note: "сарказм — реальная жалоба на отопление",
  },
  {
    body: "Не то чтобы прям проблема, но розетка на кухне искрит когда включаю чайник.",
    expected: true,
    note: "приуменьшение серьёзной (опасной) проблемы — искрящая розетка",
  },
  {
    body: "Соседи сверху шумят по ночам, можете что-то сделать?",
    expected: true,
    note: "жалоба на соседей — запрос действия, но неоднозначная зона ответственности",
  },
  {
    body: "Планирую в следующем месяце съезжать, как правильно расторгнуть договор?",
    expected: true,
    note: "процедурный запрос — намерение + нужно действие",
  },
  {
    body: "Лифт не работает уже третий день, я живу на 14 этаже, это невозможно!!!",
    expected: true,
    note: "срочная проблема, ожидается high priority",
  },
  {
    body: "Хотел уточнить показания счётчика за март, я передал 04512, всё верно записали?",
    expected: false,
    note: "уточнение по данным — не ремонтная задача",
  },
  {
    body: "Кран починили, но теперь напор слишком слабый, хотя раньше был нормальный.",
    ctx: "[tenant] Течёт кран на кухне\n[owner] Отправил сантехника, починили",
    expected: true,
    note: "новая проблема как следствие прошлого ремонта — нужен контекст",
  },
  {
    body: "Оплату за аренду отправил сегодня утром, чек приложил.",
    expected: false,
    note: "информирование об оплате, не задача",
  },
  {
    body: "Замок входной двери заедает, пока справляюсь, но скоро совсем перестанет открываться наверное.",
    expected: true,
    note: "нарастающая проблема, требует превентивного действия",
  },
];

function fmt(n: number) {
  return n.toFixed(0).padStart(6);
}
function pct(arr: number[], p: number) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function runQuality() {
  console.log(`\n=== QUALITY TEST (model=${MODEL}) — не очевидные проблемы ===`);
  let correct = 0;
  for (const c of CASES) {
    const r = await analyzeOne(c.body, c.ctx ?? "");
    if (!r.ok) {
      console.log(`\n✗ ERROR (${fmt(r.ms)}ms): ${c.note}\n  ${r.error}`);
      continue;
    }
    const p = r.parsed!;
    const hit = p.is_task === c.expected;
    if (hit) correct++;
    console.log(
      `\n${hit ? "✓" : "✗"} [${c.note}]  (${fmt(r.ms)}ms)` +
        `\n  msg: ${c.body.slice(0, 90)}` +
        `\n  expected is_task=${c.expected} | got is_task=${p.is_task} priority=${p.priority}` +
        (p.is_task ? `\n  title: ${p.title}` : ""),
    );
  }
  console.log(`\n--- Quality: ${correct}/${CASES.length} совпало с ожиданием ---`);
}

async function runLoad(concurrencies: number[]) {
  const probe = CASES[7]; // "Лифт не работает" — стабильно task
  console.log(`\n=== LOAD TEST (model=${MODEL}) ===`);
  console.log("Warming up model...");
  await analyzeOne(probe.body); // load weights into memory

  const rows: string[] = [];
  let baseAvg = 0;
  for (const n of concurrencies) {
    const wall0 = performance.now();
    const results = await Promise.all(Array.from({ length: n }, () => analyzeOne(probe.body)));
    const wall = performance.now() - wall0;
    const oks = results.filter((r) => r.ok);
    const fails = results.filter((r) => !r.ok);
    for (const f of fails)
      console.log(`    ! fail @conc=${n} (${fmt(f.ms)}ms): ${f.error?.slice(0, 200)}`);
    const lat = oks.map((r) => r.ms);
    const avg = lat.reduce((a, b) => a + b, 0) / (lat.length || 1);
    if (n === concurrencies[0]) baseAvg = avg;
    const slow = baseAvg ? (avg / baseAvg).toFixed(2) : "1.00";
    const tput = (oks.length / (wall / 1000)).toFixed(2);
    rows.push(
      `${String(n).padStart(3)} | wall ${fmt(wall)}ms | avg ${fmt(avg)}ms | ` +
        `p50 ${fmt(pct(lat, 50))}ms | p95 ${fmt(pct(lat, 95))}ms | ` +
        `min ${fmt(Math.min(...lat))} max ${fmt(Math.max(...lat))} | ` +
        `x${slow} vs base | ${tput} req/s | ok ${oks.length}/${n}`,
    );
    console.log("  " + rows[rows.length - 1]);
  }
  console.log(
    "\n--- Load summary (concurrency | wall | avg latency | p50 | p95 | min/max | slowdown | throughput | ok) ---",
  );
  console.log("conc| " + rows.join("\n     "));
}

const args = process.argv.slice(2);
function argVal(flag: string, def: string) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const mode = argVal("--mode", "both");
const conc = argVal("--concurrency", "1,5,10,15")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n > 0);

console.log(`AI_BASE_URL=${process.env.AI_BASE_URL} MODEL=${MODEL} mode=${mode} conc=${conc}`);
if (mode === "quality" || mode === "both") await runQuality();
if (mode === "load" || mode === "both") await runLoad(conc);
