import { db } from "@/lib/db"
import { usoApi } from "@/lib/db/schema"
import { calcCosto } from "./pricing"

export function logUso(
  provider: string,
  modelo: string,
  operacion: string,
  tokensIn: number,
  tokensOut: number
) {
  // Fire-and-forget: no bloquea la respuesta al usuario
  db.insert(usoApi).values({
    ts: new Date().toISOString(),
    provider,
    modelo,
    operacion,
    tokensIn,
    tokensOut,
    costoUsd: calcCosto(modelo, tokensIn, tokensOut),
  }).catch((e) => console.warn("[logUso] failed:", e))
}
