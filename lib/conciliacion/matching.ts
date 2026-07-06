import type {
  Movimiento,
  Asiento,
  Match,
  Discrepancia,
  ResultadoConciliacion,
} from "@/lib/types"

function tokenize(str: string): Set<string> {
  return new Set(
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  const union = new Set([...a, ...b]).size
  return intersection / union
}

function scorePair(mov: Movimiento, asi: Asiento): number {
  // Monto exacto requerido
  if (mov.monto !== asi.monto) return 0

  let score = 60

  // Tolerancia ±7 días
  const d1 = new Date(mov.fecha).getTime()
  const d2 = new Date(asi.fecha).getTime()
  const diffDays = Math.abs((d1 - d2) / 86_400_000)
  if (diffDays > 7) return 0
  score -= diffDays * 3

  // Bonus por referencia exacta
  if (mov.referencia && asi.referencia &&
      mov.referencia.toLowerCase() === asi.referencia.toLowerCase()) {
    score += 30
  }

  // Bonus por similitud de descripción (no requerida)
  const sim = jaccard(tokenize(mov.descripcion), tokenize(asi.descripcion))
  score += Math.round(sim * 20)

  return Math.min(score, 100)
}

export function conciliar(
  movimientos: Movimiento[],
  asientos: Asiento[],
  saldoFinalExtracto?: number,
  sumaPartidas?: number,
  saldoMayorOverride?: number
): ResultadoConciliacion {
  const matches: Match[] = []
  const usedAsientos = new Set<string>()
  const usedMovimientos = new Set<string>()

  // Greedy: puntúa todos los pares, toma los mejores primero
  const candidatos: Array<{ mov: Movimiento; asi: Asiento; score: number }> = []

  for (const mov of movimientos) {
    for (const asi of asientos) {
      const score = scorePair(mov, asi)
      if (score >= 50) {
        candidatos.push({ mov, asi, score })
      }
    }
  }

  // Ordena de mayor a menor score
  candidatos.sort((a, b) => b.score - a.score)

  for (const { mov, asi, score } of candidatos) {
    if (usedMovimientos.has(mov.id) || usedAsientos.has(asi.id)) continue
    matches.push({
      movimientoId: mov.id,
      asientoId: asi.id,
      score,
      motivo: `Monto exacto${mov.referencia === asi.referencia ? " + referencia" : ""}`,
      tipo: "confirmed",
    })
    usedMovimientos.add(mov.id)
    usedAsientos.add(asi.id)
  }

  // Discrepancias: movimientos sin match
  const discrepancias: Discrepancia[] = []

  for (const mov of movimientos) {
    if (!usedMovimientos.has(mov.id)) {
      discrepancias.push({
        tipo: "en_extracto_no_en_mayor",
        fecha: mov.fecha,
        descripcion: mov.descripcion,
        monto: mov.monto,
        movimientoId: mov.id,
      })
    }
  }

  // Asientos sin match
  for (const asi of asientos) {
    if (!usedAsientos.has(asi.id)) {
      discrepancias.push({
        tipo: "en_mayor_no_en_extracto",
        fecha: asi.fecha,
        descripcion: asi.descripcion,
        monto: asi.monto,
        asientoId: asi.id,
      })
    }
  }

  // saldoBanco: usar saldoFinalExtracto si está disponible, sino suma de movimientos
  const saldoBanco = saldoFinalExtracto ?? movimientos.reduce((s, m) => s + m.monto, 0)

  // saldoMayor: override del registry (último K del CSV, capturado al subir), sino fallback a suma
  const saldoMayor = saldoMayorOverride
    ?? [...asientos].reverse().find(a => a.saldo !== undefined)?.saldo
    ?? asientos.reduce((s, a) => s + a.monto, 0)

  // Conceptos pendientes banco = movimientos del banco no contabilizados en Tango
  const conceptosPendientes = discrepancias
    .filter(d => d.tipo === "en_extracto_no_en_mayor")
    .reduce((s, d) => s + d.monto, 0)

  // Conceptos pendientes Tango = asientos en Tango no presentes en extracto
  const conceptosPendientesTango = discrepancias
    .filter(d => d.tipo === "en_mayor_no_en_extracto")
    .reduce((s, d) => s + d.monto, 0)

  // Fórmula correcta: saldoBanco = saldoMayor + banco_no_tango - tango_no_banco
  const diferencia = saldoBanco - saldoMayor - conceptosPendientes + conceptosPendientesTango

  // Buscar qué subset de discrepancias explica la diferencia residual
  const candidatosAConciliarIds = diferencia !== 0
    ? findCandidatos(discrepancias, diferencia)
    : []

  return {
    matches,
    discrepancias,
    movimientos,
    asientos,
    saldoBanco,
    saldoMayor,
    conceptosPendientes,
    conceptosPendientesTango,
    diferencia,
    candidatosAConciliarIds,
    sumaPartidas,
    diferenciaAjustada: sumaPartidas !== undefined ? diferencia - sumaPartidas : undefined,
  }
}

// Busca el subset de discrepancias cuyas contribuciones suman exactamente `target`.
// Contribución: en_mayor_no_en_extracto = +monto, en_extracto_no_en_mayor = -monto
// (espeja cómo cada tipo afecta `diferencia` en la fórmula de reconciliación)
function findCandidatos(discrepancias: Discrepancia[], target: number): string[] {
  if (target === 0 || discrepancias.length === 0) return []

  const items = discrepancias.slice(0, 20).map(d => ({
    id: (d.movimientoId ?? d.asientoId) as string,
    contribution: d.tipo === "en_mayor_no_en_extracto" ? d.monto : -d.monto,
  }))

  let found: string[] | null = null

  function dfs(idx: number, remaining: number, current: string[]): void {
    if (found) return
    if (remaining === 0) { found = [...current]; return }
    if (idx >= items.length) return
    const item = items[idx]
    current.push(item.id)
    dfs(idx + 1, remaining - item.contribution, current)
    current.pop()
    dfs(idx + 1, remaining, current)
  }

  dfs(0, target, [])
  return found ?? []
}

function centavosAString(c: number): string {
  const sign = c < 0 ? "-" : ""
  const abs = Math.abs(c)
  return `${sign}$${(abs / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
}

export { centavosAString }
