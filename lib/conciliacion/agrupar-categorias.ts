import type { Discrepancia } from "@/lib/types"
import { clasificarImpuesto, bucketConcepto } from "@/lib/extractos/impuestos"
import { categorizarMovimiento } from "@/lib/extractos/categorize"

/**
 * Agrupa las discrepancias pendientes por categoría EFECTIVA para la vista
 * ordenada (acordeones). Presentacional: no toca la verificación matemática
 * (esa vive en explicarGap). Respeta el override manual del usuario.
 *
 * Categoría efectiva de un ítem:
 *   1. bucketOverride (elegido a mano)     — máxima prioridad
 *   2. préstamo (grupoId / categoria)      → "Préstamos"
 *   3. no impositivo (clasificarImpuesto null) → "Operativos"
 *   4. bucket de impuesto/gasto            → su bucket
 */

export type SeccionCategoria = {
  categoria: string
  lado: "banco" | "mayor" | "mixto"
  items: Discrepancia[]
  total: number // centavos, con signo de contribución al gap
  count: number
}

const contrib = (d: Discrepancia) => d.tipo === "en_extracto_no_en_mayor" ? d.monto : -d.monto

export function categoriaEfectiva(d: Discrepancia): string {
  if (d.bucketOverride) return d.bucketOverride
  if (d.categoria === "prestamo" || d.categoria === "prestamo_iva" || d.grupoId) return "Préstamos"
  if (clasificarImpuesto(d.descripcion, d.monto) === null) return "Operativos"
  return bucketConcepto(d.descripcion, d.monto, categorizarMovimiento(d.descripcion))
}

export function agruparPorCategoria(discrepancias: Discrepancia[]): SeccionCategoria[] {
  const map = new Map<string, SeccionCategoria>()
  for (const d of discrepancias) {
    const categoria = categoriaEfectiva(d)
    const lado: "banco" | "mayor" = d.tipo === "en_extracto_no_en_mayor" ? "banco" : "mayor"
    const prev = map.get(categoria)
    if (prev) {
      prev.items.push(d)
      prev.total += contrib(d)
      prev.count++
      if (prev.lado !== lado) prev.lado = "mixto"
    } else {
      map.set(categoria, { categoria, lado, items: [d], total: contrib(d), count: 1 })
    }
  }
  for (const s of map.values()) {
    s.items.sort((a, b) => a.fecha.localeCompare(b.fecha) || Math.abs(b.monto) - Math.abs(a.monto))
  }
  return [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}

// ── self-check ──  ./node_modules/.bin/tsx lib/conciliacion/agrupar-categorias.ts
if (process.argv[1] && process.argv[1].endsWith("agrupar-categorias.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  const d = (descripcion: string, monto: number, extra: Partial<Discrepancia> = {}): Discrepancia =>
    ({ tipo: "en_extracto_no_en_mayor", fecha: "2026-01-15", descripcion, monto, ...extra })

  const secs = agruparPorCategoria([
    d("IVA ALICUOTA GENERAL", -10000),
    d("IVA RG 2408", -5000),
    d("IIBB CABA AGIP", -2000),
    d("TRANSFERENCIA ENTRE CUENTAS", -38000),      // operativo
    d("AMORT.S/PRESTAMO OTORG.", -100000, { grupoId: "g1", categoria: "prestamo" }),
  ])
  const byCat = new Map(secs.map(s => [s.categoria, s]))
  assert(byCat.get("IVA")!.count === 2 && byCat.get("IVA")!.total === -15000, "IVA agrupa 2 = -15000")
  assert(byCat.get("Operativos")!.count === 1, "transferencia → Operativos")
  assert(byCat.get("Préstamos")!.count === 1, "amort → Préstamos")
  assert(byCat.get("Ingresos Brutos CABA") !== undefined, "IIBB CABA su bucket")

  // override manda: el IIBB pasa a IVA
  const secs2 = agruparPorCategoria([
    d("IVA ALICUOTA GENERAL", -10000),
    d("IIBB CABA AGIP", -2000, { bucketOverride: "IVA" }),
  ])
  const iva = secs2.find(s => s.categoria === "IVA")!
  assert(iva.count === 2 && iva.total === -12000, "override mueve IIBB a IVA")
  assert(secs2.find(s => s.categoria === "Ingresos Brutos CABA") === undefined, "IIBB ya no está en su bucket")

  // suma de secciones = suma de contribuciones
  const items = [d("IVA", -100), d("IMP SELLOS", -50), d("PAGO SERVICIOS", -200)]
  const total = agruparPorCategoria(items).reduce((s, x) => s + x.total, 0)
  assert(total === items.reduce((s, x) => s + contrib(x), 0), "suma secciones = suma contribuciones")

  console.log("OK agrupar-categorias.ts — todos los asserts pasaron")
}
