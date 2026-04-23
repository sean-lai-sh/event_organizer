/**
 * LLM Adapter — wraps the Anthropic Claude API.
 *
 * All structured JSON calls go through here. The adapter:
 * - Sends system + user prompt
 * - Parses JSON from the response
 * - Validates against the provided Zod schema
 * - Returns typed output or throws a structured error
 *
 * This keeps LLM integration isolated from service logic.
 */

import Anthropic from "@anthropic-ai/sdk";
import { type ZodSchema } from "zod";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

// Model to use for structured JSON tasks. Can be overridden per call.
const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface LLMCallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMCallResult<T> {
  data: T;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Call the LLM with a structured JSON prompt and validate the response.
 *
 * @param system - System prompt (rules + role)
 * @param user - User prompt (specific task + data)
 * @param schema - Zod schema to validate the parsed JSON
 * @param options - Optional model/token overrides
 */
export async function callLLMStructured<T>(
  system: string,
  user: string,
  schema: ZodSchema<T>,
  options: LLMCallOptions = {}
): Promise<LLMCallResult<T>> {
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? 2048;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  // Extract text from the response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM returned no text content");
  }

  // Strip markdown fences if model ignored the JSON-only instruction
  let raw = textBlock.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  // Validate against Zod schema
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `LLM output failed schema validation: ${result.error.message}\nRaw: ${raw.slice(0, 300)}`
    );
  }

  return {
    data: result.data,
    modelName: model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ─── Mock LLM adapter for local dev without API key ──────────────────────────

/**
 * Returns deterministic mock data matching any Zod schema.
 * Used when ANTHROPIC_API_KEY is not set (local dev / CI).
 */
export function isMockMode(): boolean {
  return !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "mock";
}
