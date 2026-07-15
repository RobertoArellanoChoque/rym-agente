import { tokenize } from "./matching"

// Contexto de aprendizaje derivado de decisiones humanas (matches origen='manual').
// Todo serializable a partir de estructuras simples (Map/Set).
export type ContextoAprendizaje = {
  // token del banco → tokens de Tango que el humano confirmó como equivalentes
  aliases?: Map<string, Set<string>>
  // firmas canónicas de pares que el humano rechazó (no re-proponer)
  rechazados?: Set<string>
}

type Par = { descBanco: string; descTango: string }

const UMBRAL_ALIAS = 2   // co-ocurrencias mínimas para aceptar un alias token→token
const MAX_EXPANSIONES = 5 // cap de aliases por token del banco (evita explosión)

// De pares CONFIRMADOS manualmente: cuenta co-ocurrencias de tokens banco↔Tango.
// Un alias bt→tt se acepta si co-ocurre >= UMBRAL_ALIAS. Determinístico (ordenado).
export function aprenderAliases(historial: Par[]): Map<string, Set<string>> {
  const conteo = new Map<string, Map<string, number>>() // bt → (tt → count)
  for (const { descBanco, descTango } of historial) {
    const banco = tokenize(descBanco)
    const tango = tokenize(descTango)
    for (const bt of banco) {
      for (const tt of tango) {
        if (bt === tt) continue // identidad ya matchea vía jaccard
        const inner = conteo.get(bt) ?? new Map<string, number>()
        inner.set(tt, (inner.get(tt) ?? 0) + 1)
        conteo.set(bt, inner)
      }
    }
  }

  const aliases = new Map<string, Set<string>>()
  for (const bt of [...conteo.keys()].sort()) {
    const aceptados = [...conteo.get(bt)!.entries()]
      .filter(([, c]) => c >= UMBRAL_ALIAS)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)) // count desc, luego token asc
      .slice(0, MAX_EXPANSIONES)
      .map(([tt]) => tt)
      .sort()
    if (aceptados.length > 0) aliases.set(bt, new Set(aceptados))
  }
  return aliases
}

// Firma canónica de un par: tokens ordenados de banco y Tango concatenados.
// Misma función al aprender (firmasRechazadas) y al scorear (scorePair) → sin divergencia.
export function firmaPar(descBanco: string, descTango: string): string {
  const b = [...tokenize(descBanco)].sort().join(" ")
  const t = [...tokenize(descTango)].sort().join(" ")
  return `${b}|${t}`
}

// De pares RECHAZADOS manualmente: set de firmas vetadas.
export function firmasRechazadas(historial: Par[]): Set<string> {
  const firmas = new Set<string>()
  for (const { descBanco, descTango } of historial) {
    firmas.add(firmaPar(descBanco, descTango))
  }
  return firmas
}
