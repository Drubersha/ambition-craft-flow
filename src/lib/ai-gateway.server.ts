import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Resolve the AI provider for server-side features (task recognition, etc.).
 * Uses a self-hosted / external OpenAI-compatible endpoint via AI_BASE_URL + AI_API_KEY.
 * Example (local ollama): AI_BASE_URL=http://ollama:11434/v1, AI_API_KEY=ollama.
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
    });
  }
  return null;
}

/** Model id for AI task analysis. Override via AI_MODEL (e.g. "llava:7b" for local ollama). */
export function getAiModelName() {
  return process.env.AI_MODEL || "qwen2.5:1.5b";
}
