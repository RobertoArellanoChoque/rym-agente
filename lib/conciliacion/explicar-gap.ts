import type { Discrepancia } from "@/lib/types"
import { bucketConcepto } from "@/lib/extractos/impuestos"
import { categorizarMovimiento } from "@/lib/extractos/categorize"

/**
 * Explica la diferencia Banco−Mayor POR MONTOS, y recién después agrupa.
 *
 * Los nombres entre Tango y el extracto nunca coinciden, así que acá no se
 * matchea por nombre: cada ítem sin conciliar contribuye al gap por su monto
 * (lado banco +monto, lado mayor −monto — espejo de la identidad de
 * `diferencia` en matching.ts). El bucket solo ETIQUETA los contribuyentes
 * para presentarlos: ≥2 ítems del mismo tipo y lado = un grupo que se sube al
 * mayor de una vez; ítems sueltos/heterogéneos = cuentas a conciliar aparte.
 */

export type GrupoExplicacion = {
  bucket: string
  lado: "banco" | "mayor" // banco = falta registrar en mayor · mayor = sin respaldo en banco
  items: Discrepancia[]   // siempre ≥2 — los singles van a cuentasAConciliar
  total: number // centavos — contribución al gap (con signo)
}

export type ExplicacionGap = {
  grupos: GrupoExplicacion[]
  cuentasAConciliar: Discrepancia[]
  totalExplicado: number
  residual: number
  cuadra: boolean
}

export function explicarGap(
  discrepancias: Discrepancia[],
  gapBruto: number, // saldoBanco − saldoMayor
  sumaPartidas: number
): ExplicacionGap {
  const map = new Map<string, GrupoExplicacion>()

  for (const d of discrepancias) {
    const lado: GrupoExplicacion["lado"] = d.tipo === "en_extracto_no_en_mayor" ? "banco" : "mayor"
    const bucket = bucketConcepto(d.descripcion, d.monto, categorizarMovimiento(d.descripcion))
    const key = `${lado}||${bucket}`
    const contribucion = lado === "banco" ? d.monto : -d.monto
    const prev = map.get(key)
    if (prev) {
      prev.items.push(d)
      prev.total += contribucion
    } else {
      map.set(key, { bucket, lado, items: [d], total: contribucion })
    }
  }

  const grupos: GrupoExplicacion[] = []
  const cuentasAConciliar: Discrepancia[] = []
  for (const g of map.values()) {
    if (g.items.length >= 2) {
      grupos.push(g)
    } else {
      // Ítem solo en su bucket → cosa distinta, va aparte (ej: PRESTAMO $38M)
      cuentasAConciliar.push(g.items[0])
    }
  }
  grupos.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  cuentasAConciliar.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))

  // Todo contribuye al gap, agrupado o no: totalExplicado = grupos + sueltos
  const contribCuentas = cuentasAConciliar.reduce(
    (s, d) => s + (d.tipo === "en_extracto_no_en_mayor" ? d.monto : -d.monto), 0)
  const totalExplicado = grupos.reduce((s, g) => s + g.total, 0) + contribCuentas

  const residual = gapBruto - totalExplicado - sumaPartidas
  return { grupos, cuentasAConciliar, totalExplicado, residual, cuadra: residual === 0 }
}

// ── self-check ──  ./node_modules/.bin/tsx lib/conciliacion/explicar-gap.ts
if (process.argv[1] && process.argv[1].endsWith("explicar-gap.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  const d = (tipo: Discrepancia["tipo"], descripcion: string, monto: number): Discrepancia =>
    ({ tipo, fecha: "2026-01-15", descripcion, monto })

  // 3 impuestos banco (−100, −200, −300) + 1 préstamo banco (+38000)
  const discrepancias = [
    d("en_extracto_no_en_mayor", "PAGOS AFIP IVA", -100),
    d("en_extracto_no_en_mayor", "IVA ALICUOTA GENERAL", -200),
    d("en_extracto_no_en_mayor", "RET IVA RG", -300),
    d("en_extracto_no_en_mayor", "PRESTAMO OTORGADO", 38000),
  ]
  // gapBruto que explican exactamente: −600 + 38000 = 37400
  const r = explicarGap(discrepancias, 37400, 0)
  assert(r.grupos.length === 1, "1 grupo (IVA)")
  assert(r.grupos[0].items.length === 3 && r.grupos[0].total === -600, "grupo IVA 3 ítems total -600")
  assert(r.cuentasAConciliar.length === 1 && r.cuentasAConciliar[0].descripcion === "PRESTAMO OTORGADO", "préstamo = cuenta a conciliar")
  assert(r.totalExplicado === 37400 && r.cuadra && r.residual === 0, "cuadra exacto")

  // residual ≠ 0 detectado
  const r2 = explicarGap(discrepancias, 37500, 0)
  assert(!r2.cuadra && r2.residual === 100, "residual 100 detectado")

  // partidas entran en la verificación
  const r3 = explicarGap(discrepancias, 37500, 100)
  assert(r3.cuadra, "partidas cierran el residual")

  // lado mayor contribuye con signo invertido
  const r4 = explicarGap([
    d("en_mayor_no_en_extracto", "BCO IMP LEY S/DEB", -50),
    d("en_mayor_no_en_extracto", "BCO IMP LEY S/DEB 2", -70),
  ], 120, 0)
  assert(r4.grupos.length === 1 && r4.grupos[0].lado === "mayor" && r4.grupos[0].total === 120, "lado mayor invierte signo")
  assert(r4.cuadra, "cuadra lado mayor")

  console.log("OK explicar-gap.ts — todos los asserts pasaron")
}
