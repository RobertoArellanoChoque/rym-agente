import { db } from "@/lib/db"
import { usoApi } from "@/lib/db/schema"
import { calcCosto } from "./pricing"
import { currentOrgId } from "@/lib/auth/current-user"

export async function logUso(
  provider: "anthropic" | "mistral" | "openai",
  modelo: string,
  operacion: string,
  tokensIn: number,
  tokensOut: number
) {
  // currentOrgId() ya es defensivo (null si no hay contexto de request) — no
  // rompe el logging de costo de IA si por algún motivo no hay org activa.
  const orgId = await currentOrgId()
  // Fire-and-forget: no bloquea la respuesta al usuario
  db.insert(usoApi).values({
    ts: new Date().toISOString(),
    provider,
    modelo,
    operacion,
    tokensIn,
    tokensOut,
    costoUsd: calcCosto(modelo, tokensIn, tokensOut),
    orgId,
  }).catch((e) => console.warn("[logUso] failed:", e))
}
