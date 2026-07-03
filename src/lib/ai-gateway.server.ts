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

/**
 * Resolve the AI provider for server-side features (task recognition, etc.).
 * Priority:
 *  1. Self-hosted / external OpenAI-compatible endpoint via AI_BASE_URL + AI_API_KEY.
 *     Example (local ollama): AI_BASE_URL=http://ollama:11434/v1, AI_API_KEY=ollama.
 *  2. Lovable AI gateway via LOVABLE_API_KEY (works only on Lovable Cloud).
 * Returns null when nothing is configured.
 */
export function createAiProvider() {
  const baseURL = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  if (baseURL && apiKey) {
    return createOpenAICompatible({
      name: "selfhost",
      baseURL,
      headers: { Authorization: `Bearer ${apiKey}` },
      // Send a native JSON-schema `response_format` (grammar-constrained decoding
      // on OpenAI-compatible servers like ollama/vLLM). This forces the model to
      // emit valid, schema-conforming JSON instead of the SDK's prompt-based
      // fallback — far fewer parse failures under load and cleaner fields.
      supportsStructuredOutputs: true,
    });
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) return createLovableAiGatewayProvider(lovableKey);
  return null;
}

/** Model id for AI task analysis. Override via AI_MODEL (e.g. "llava:7b" for local ollama). */
export function getAiModelName() {
  return process.env.AI_MODEL || "google/gemini-2.5-flash";
}
