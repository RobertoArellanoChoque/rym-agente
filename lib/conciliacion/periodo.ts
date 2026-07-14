/**
 * Período de una conciliación = mes calendario dominante de sus movimientos/asientos.
 * No hay campo de período en el extracto/mayor; se deriva de las fechas (YYYY-MM-DD).
 * Robusto a fechas sueltas (una operación de otro mes no cambia el período): usa la moda.
 */

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

// fechas ISO YYYY-MM-DD → "YYYY-MM" del mes con más ocurrencias (undefined si vacío)
export function periodoDeFechas(fechas: (string | undefined)[]): string | undefined {
  const conteo = new Map<string, number>()
  for (const f of fechas) {
    const m = /^(\d{4})-(\d{2})/.exec(f ?? "")
    if (!m) continue
    const ym = `${m[1]}-${m[2]}`
    conteo.set(ym, (conteo.get(ym) ?? 0) + 1)
  }
  let mejor: string | undefined
  let max = 0
  for (const [ym, n] of conteo) {
    if (n > max) { max = n; mejor = ym }
  }
  return mejor
}

// "YYYY-MM" → mes siguiente "YYYY-MM"
export function siguientePeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo)
  if (!m) return periodo
  let y = Number(m[1])
  let mes = Number(m[2]) + 1
  if (mes > 12) { mes = 1; y += 1 }
  return `${y}-${String(mes).padStart(2, "0")}`
}

// "YYYY-MM" → "Febrero 2026"
export function nombreMes(periodo: string | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo ?? "")
  if (!m) return periodo ?? ""
  const idx = Number(m[2]) - 1
  return `${MESES_ES[idx] ?? m[2]} ${m[1]}`
}

// ── self-check ──  ./node_modules/.bin/tsx lib/conciliacion/periodo.ts
if (process.argv[1] && process.argv[1].endsWith("periodo.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }

  assert(periodoDeFechas(["2026-01-05", "2026-01-20", "2026-02-01"]) === "2026-01", "moda enero")
  assert(periodoDeFechas([]) === undefined, "vacío → undefined")
  assert(periodoDeFechas(["basura", "2026-03-10"]) === "2026-03", "ignora inválidas")
  assert(siguientePeriodo("2026-01") === "2026-02", "ene→feb")
  assert(siguientePeriodo("2026-12") === "2027-01", "dic→ene año+1")
  assert(nombreMes("2026-02") === "Febrero 2026", "nombre es-AR")
  assert(nombreMes(undefined) === "", "undefined → vacío")

  console.log("OK periodo.ts — todos los asserts pasaron")
}
