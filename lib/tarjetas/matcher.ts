import { db } from "@/lib/db"
import { tarjetasMaestras } from "@/lib/db/schema"

export interface TarjetaMaestraRow {
  id: string
  nombre: string
  banco: string
  tipo: string
  activa: number
}

const BANCO_ALIASES: Record<string, string[]> = {
  FRANCES: ["FRANCES", "BBVA FRANCES", "BBVA"],
  RIO: ["RIO", "BANCO RIO", "SANTANDER RIO", "SANTANDER"],
  FCES: ["FCES", "FUERZAS", "FUERZAS COMPLEMENTARIAS"],
}

export async function matchTarjeta(text: string): Promise<{ tarjeta: TarjetaMaestraRow | null; confidence: number }> {
  const all = await db.select().from(tarjetasMaestras) as TarjetaMaestraRow[]
  if (!all.length) return { tarjeta: null, confidence: 0 }

  const up = text.toUpperCase()

  let best: TarjetaMaestraRow | null = null
  let bestScore = 0

  for (const t of all) {
    if (!t.activa) continue
    let score = 0

    // Card type (2 pts)
    if (t.tipo === "AMEX" && (up.includes("AMEX") || up.includes("AMERICAN EXPRESS"))) score += 2
    if (t.tipo === "VISA" && up.includes("VISA") && !up.includes("MASTERCARD")) score += 2
    if (t.tipo === "MASTERCARD" && (up.includes("MASTER") || up.includes("MASTERCARD"))) score += 2

    // Bank name (3 pts)
    const aliases = BANCO_ALIASES[t.banco] ?? [t.banco]
    if (aliases.some((a) => up.includes(a))) score += 3

    // Card number specifics (5 pts) — disambiguates GFC 3766 vs 3767
    if (t.nombre.includes("3766") && up.includes("3766")) score += 5
    if (t.nombre.includes("3767") && up.includes("3767")) score += 5

    // Corporate vs retail (1 pt)
    if (t.nombre.includes("CORP") && up.includes("CORP")) score += 1
    if (t.nombre.includes("COPR") && (up.includes("COPR") || up.includes("CORP"))) score += 1

    // CA suffix (distinguishes VISA GFC CA vs plain VISA GFC)
    if (t.nombre.includes(" CA") && (up.includes(" CA ") || up.endsWith(" CA"))) score += 1

    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }

  const confidence = bestScore >= 5 ? 0.9 : bestScore >= 3 ? 0.7 : bestScore >= 1 ? 0.4 : 0
  return { tarjeta: best, confidence }
}
