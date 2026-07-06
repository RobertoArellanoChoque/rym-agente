import { createMistral } from "@ai-sdk/mistral"
import { createOpenAI } from "@ai-sdk/openai"
import { generateObject } from "ai"
import type { z } from "zod"
import { logUso } from "./log-uso"

function resolveModel(provider: "mistral" | "openai") {
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY
    if (!key || key === "placeholder") return null
    return { model: createOpenAI({ apiKey: key })("gpt-4o"), modelo: "gpt-4o" }
  }
  const key = process.env.MISTRAL_API_KEY
  if (!key || key === "placeholder") return null
  return { model: createMistral({ apiKey: key })("mistral-large-latest"), modelo: "mistral-large-latest" }
}

export async function generateJSON<T>(
  prompt: string,
  schema: z.ZodType<T>,
  systemPrompt?: string,
  operacion = "unknown",
  provider: "mistral" | "openai" = "mistral",
): Promise<T> {
  const resolved = resolveModel(provider)
  if (!resolved) throw new Error(`AI model not configured. Set ${provider.toUpperCase()}_API_KEY in .env.local`)
  const { object, usage } = await generateObject({ model: resolved.model, schema, system: systemPrompt, prompt, maxRetries: 1 })
  logUso(provider, resolved.modelo, operacion, usage.inputTokens ?? 0, usage.outputTokens ?? 0)
  return object
}

// OpenAI para sugerencias de matching (descripciones difieren mucho)
export const generateJSONOpenAI = <T>(prompt: string, schema: z.ZodType<T>, systemPrompt?: string, operacion = "matching") =>
  generateJSON(prompt, schema, systemPrompt, operacion, "openai")
