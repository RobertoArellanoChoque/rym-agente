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

// Tolerancia de cuadre: absorbe redondeo de OCR/parse (Math.round(n*100) en
// banco y Tango). Un residual bajo esto se considera conciliado. El residual
// exacto igual se muestra; esto solo controla el flag "cuadra"/aprobación.
export const TOLERANCIA_CUADRE = 200 // centavos ($2)

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

/**
 * Identidad de reconciliación. OJO: opera sobre MOVIMIENTOS NETOS del período
 * (Σ monto), NO sobre saldos de cierre. Con saldos de cierre la fórmula colapsa
 * a `saldoInicialBanco − saldoInicialMayor` (el arrastre del período anterior),
 * que no tiene nada que ver con conciliar el mes. Los saldos de cierre se
 * muestran aparte (header saldoAnterior/saldoFinal), no entran acá.
 */
export function calcularFinanzas(
  movimientos: { monto: number }[],
  asientos: { monto: number }[],
  discrepancias: Discrepancia[],
  sumaPartidas?: number
) {
  const saldoBanco = movimientos.reduce((s, m) => s + m.monto, 0) // neto período
  const saldoMayor = asientos.reduce((s, a) => s + a.monto, 0)    // neto período
  const conceptosPendientes = discrepancias
    .filter(d => d.tipo === "en_extracto_no_en_mayor")
    .reduce((s, d) => s + d.monto, 0)
  const conceptosPendientesTango = discrepancias
    .filter(d => d.tipo === "en_mayor_no_en_extracto")
    .reduce((s, d) => s + d.monto, 0)
  const diferencia = saldoBanco - saldoMayor - conceptosPendientes + conceptosPendientesTango
  return {
    saldoBanco,
    saldoMayor,
    conceptosPendientes,
    conceptosPendientesTango,
    diferencia,
    diferenciaAjustada: sumaPartidas !== undefined ? diferencia - sumaPartidas : undefined,
  }
}

export function conciliar(
  movimientos: Movimiento[],
  asientos: Asiento[],
  sumaPartidas?: number
): ResultadoConciliacion {
  const matches: Match[] = []
  const usedAsientos = new Set<string>()
  const usedMovimientos = new Set<string>()

  // ── Pre-pass: grupos préstamo (N líneas banco) vs asiento Tango combinado ──
  // El banco muestra AMORT + IVAs como líneas separadas; Tango las registra en
  // UN asiento por la suma exacta. Corre ANTES del greedy para que el asiento
  // combinado no sea consumido por un match 1:1.
  const grupos = new Map<string, Movimiento[]>()
  for (const mov of movimientos) {
    if (!mov.grupoId) continue
    const arr = grupos.get(mov.grupoId) ?? []
    arr.push(mov)
    grupos.set(mov.grupoId, arr)
  }
  for (const [, miembros] of grupos) {
    const suma = miembros.reduce((s, m) => s + m.monto, 0)
    const fechaGrupo = new Date(miembros[0].fecha).getTime()
    const asiento = asientos.find(a =>
      !usedAsientos.has(a.id) &&
      a.monto === suma &&
      Math.abs(new Date(a.fecha).getTime() - fechaGrupo) <= 7 * 86_400_000
    )
    if (!asiento) continue
    usedAsientos.add(asiento.id)
    for (const m of miembros) {
      usedMovimientos.add(m.id)
      matches.push({
        movimientoId: m.id,
        asientoId: asiento.id,
        score: 95,
        motivo: "Grupo préstamo vs asiento combinado",
        tipo: "confirmed",
      })
    }
  }

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
        categoria: mov.categoria,
        grupoId: mov.grupoId,
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

  const fin = calcularFinanzas(movimientos, asientos, discrepancias, sumaPartidas)

  // Buscar qué subset de discrepancias explica la diferencia residual
  const candidatosAConciliarIds = fin.diferencia !== 0
    ? findCandidatos(discrepancias, fin.diferencia)
    : []

  return {
    matches,
    discrepancias,
    movimientos,
    asientos,
    ...fin,
    candidatosAConciliarIds,
    sumaPartidas,
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
