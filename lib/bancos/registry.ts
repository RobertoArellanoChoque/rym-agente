import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { bancos } from "@/lib/db/schema"
import type { BankConfig } from "./types"

const TTL_MS = 5 * 60_000
// ponytail: cache por instancia (no compartida entre réplicas). Agregar/editar un banco
// tarda ≤5min en verse en cada instancia. Bajá el TTL o purgá el módulo si necesitás inmediatez.
let cache: { configs: BankConfig[]; at: number } | null = null

/** Bancos activos, mapeados a BankConfig. Cache in-memory con TTL de 5min. */
export async function getBancos(): Promise<BankConfig[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.configs
  const rows = await db.select().from(bancos).where(eq(bancos.activo, true))
  const configs = rows.map((r): BankConfig => ({
    id: r.id,
    name: r.nombre,
    aliases: r.aliases,
    dateFormat: r.dateFormat,
    decimalSeparator: r.decimalSeparator,
    thousandSeparator: r.thousandSeparator,
    extractionSystemPrompt: r.extractionSystemPrompt,
    ...(r.excelColumns ? { excelColumns: r.excelColumns } : {}),
  }))
  cache = { configs, at: Date.now() }
  return configs
}

// Detección por regla (sin LLM): uppercase includes sobre aliases. Pura — configs inyectadas.
export function matchBankByAlias(text: string, configs: BankConfig[]): BankConfig | null {
  const upper = text.toUpperCase()
  for (const config of configs) {
    if (config.aliases.some((alias) => upper.includes(alias.toUpperCase()))) {
      return config
    }
  }
  return null
}

export async function detectBankByKeyword(text: string): Promise<BankConfig | null> {
  return matchBankByAlias(text, await getBancos())
}

export async function findBanco(id: string): Promise<BankConfig | null> {
  return (await getBancos()).find((c) => c.id === id) ?? null
}
