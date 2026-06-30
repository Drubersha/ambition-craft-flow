import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

export type AiConfig = {
  kind: "lovable" | "local";
  provider: ReturnType<typeof createOpenAICompatible>;
  model: string;
};

/**
 * Resolve the AI provider from the environment.
 *
 * Default is the Lovable AI Gateway (requires `LOVABLE_API_KEY`). For a fully
 * self-hosted / offline setup, point at any OpenAI-compatible endpoint (e.g.
 * a local Ollama server) by setting `AI_PROVIDER=local` (or `AI_BASE_URL`).
 * In that mode no external API key is required.
 *
 *   AI_PROVIDER=local
 *   AI_BASE_URL=http://localhost:11434/v1   # Ollama OpenAI-compatible API
 *   AI_MODEL=qwen2.5vl:7b                    # any vision-capable local model
 *
 * Returns `null` when no provider can be configured (e.g. lovable mode with no
 * key), so callers can surface a clear "no AI configured" result.
 */
export function resolveAiConfig(): AiConfig | null {
  const baseURL = process.env.AI_BASE_URL?.trim();
  const providerKind = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  const useLocal =
    providerKind === "local" ||
    providerKind === "ollama" ||
    (!!baseURL && providerKind !== "lovable");

  if (useLocal) {
    const url = baseURL || "http://localhost:11434/v1";
    const model = process.env.AI_MODEL?.trim() || "qwen2.5vl:7b";
    const apiKey = process.env.AI_API_KEY?.trim() || "ollama";
    const provider = createOpenAICompatible({
      name: "local",
      baseURL: url,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { kind: "local", provider, model };
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  return {
    kind: "lovable",
    provider: createLovableAiGatewayProvider(key),
    model: process.env.AI_MODEL?.trim() || "google/gemini-2.5-flash",
  };
}
