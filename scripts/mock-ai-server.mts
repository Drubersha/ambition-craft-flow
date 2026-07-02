/**
 * Minimal mock OpenAI-compatible /chat/completions endpoint with a fixed,
 * configurable per-request delay. Used to isolate the app/request-layer
 * concurrency overhead from the real (CPU-bound) model compute.
 *
 *   MOCK_DELAY_MS=1000 MOCK_PORT=11499 bun scripts/mock-ai-server.mts
 */
const delay = Number(process.env.MOCK_DELAY_MS ?? 1000);
const port = Number(process.env.MOCK_PORT ?? 11499);

const payload = JSON.stringify({
  is_task: true,
  title: "Течёт кран на кухне",
  description: "Постоянно капает, под мойкой лужа.",
  priority: "high",
});

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/chat/completions")) {
      await new Promise((r) => setTimeout(r, delay));
      return Response.json({
        id: "mock",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "mock",
        choices: [
          { index: 0, message: { role: "assistant", content: payload }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }
    return new Response("ok");
  },
});
console.log(`mock AI on :${port} delay=${delay}ms`);
