import { ALL_CONFIGS } from "./configs"
import type { BankConfig } from "./types"

// Rule-based detection — no LLM needed for well-known banks
export function detectBankByKeyword(text: string): BankConfig | null {
  const upper = text.toUpperCase()
  for (const config of ALL_CONFIGS) {
    if (config.aliases.some((alias) => upper.includes(alias.toUpperCase()))) {
      return config
    }
  }
  return null
}
