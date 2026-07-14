import type { Discrepancia } from "@/lib/types"
import { bucketConcepto, clasificarImpuesto } from "@/lib/extractos/impuestos"
import { categorizarMovimiento } from "@/lib/extractos/categorize"
import { TOLERANCIA_CUADRE } from "@/lib/conciliacion/matching"

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
  items: Discrepancia[]   // ≥2, salvo grupos préstamo (siempre grupo aunque sea 1)
  total: number // centavos — contribución al gap (con signo)
  esPrestamo?: boolean // amortización + impuestos relacionados de un préstamo pendiente
}

export type ExplicacionGap = {
  grupos: GrupoExplicacion[]
  cuentasAConciliar: Discrepancia[]
  operativos: Discrepancia[] // movimientos no impositivos (débitos autom., pagos, transferencias) — explican gap pero van aparte
  totalExplicado: number
  residual: number
  cuadra: boolean
}

const contrib = (d: Discrepancia) => d.tipo === "en_extracto_no_en_mayor" ? d.monto : -d.monto

export function explicarGap(
  discrepancias: Discrepancia[],
  gapBruto: number, // saldoBanco − saldoMayor
  sumaPartidas: number
): ExplicacionGap {
  const map = new Map<string, GrupoExplicacion>()
  const operativos: Discrepancia[] = []

  for (const d of discrepancias) {
    const lado: GrupoExplicacion["lado"] = d.tipo === "en_extracto_no_en_mayor" ? "banco" : "mayor"

    // Préstamo pendiente (sin asiento en Tango): grupo propio por grupoId —
    // amortización + impuestos relacionados juntos, siempre como grupo.
    if (d.categoria === "prestamo" || d.categoria === "prestamo_iva") {
      const key = `prestamo||${d.grupoId ?? d.fecha}`
      const prev = map.get(key)
      if (prev) { prev.items.push(d); prev.total += contrib(d) }
      else map.set(key, {
        bucket: `Préstamo ${d.fecha} — amortización + impuestos relacionados`,
        lado, items: [d], total: contrib(d), esPrestamo: true,
      })
      continue
    }

    // No-impositivo (transferencias, débitos automáticos, pagos, préstamos
    // otorgados…) → sección operativos, no contamina "cuentas a conciliar".
    if (clasificarImpuesto(d.descripcion, d.monto) === null) {
      operativos.push(d)
      continue
    }

    const bucket = bucketConcepto(d.descripcion, d.monto, categorizarMovimiento(d.descripcion))
    const key = `${lado}||${bucket}`
    const prev = map.get(key)
    if (prev) {
      prev.items.push(d)
      prev.total += contrib(d)
    } else {
      map.set(key, { bucket, lado, items: [d], total: contrib(d) })
    }
  }

  const grupos: GrupoExplicacion[] = []
  const cuentasAConciliar: Discrepancia[] = []
  for (const g of map.values()) {
    if (g.items.length >= 2 || g.esPrestamo) {
      grupos.push(g)
    } else {
      // Ítem solo en su bucket → cosa distinta, va aparte
      cuentasAConciliar.push(g.items[0])
    }
  }
  grupos.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  cuentasAConciliar.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))
  operativos.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))

  // Todo contribuye al gap, agrupado o no: totalExplicado = grupos + sueltos + operativos
  const contribCuentas = cuentasAConciliar.reduce((s, d) => s + contrib(d), 0)
  const contribOperativos = operativos.reduce((s, d) => s + contrib(d), 0)
  const totalExplicado = grupos.reduce((s, g) => s + g.total, 0) + contribCuentas + contribOperativos

  const residual = gapBruto - totalExplicado - sumaPartidas
  return { grupos, cuentasAConciliar, operativos, totalExplicado, residual, cuadra: Math.abs(residual) <= TOLERANCIA_CUADRE }
}

// ── self-check ──  ./node_modules/.bin/tsx lib/conciliacion/explicar-gap.ts
if (process.argv[1] && process.argv[1].endsWith("explicar-gap.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  const d = (tipo: Discrepancia["tipo"], descripcion: string, monto: number): Discrepancia =>
    ({ tipo, fecha: "2026-01-15", descripcion, monto })

  // 3 impuestos banco (−100, −200, −300) + 1 préstamo otorgado banco (+38000 — operativo)
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
  assert(r.operativos.length === 1 && r.operativos[0].descripcion === "PRESTAMO OTORGADO", "préstamo otorgado = operativo, no cuenta a conciliar")
  assert(r.cuentasAConciliar.length === 0, "sin cuentas sueltas")
  assert(r.totalExplicado === 37400 && r.cuadra && r.residual === 0, "cuadra exacto (operativos suman)")

  // residual fuera de tolerancia detectado
  const r2 = explicarGap(discrepancias, 37900, 0)
  assert(!r2.cuadra && r2.residual === 500, "residual 500 detectado (> tolerancia)")

  // residual chico (redondeo) entra en tolerancia
  const r2b = explicarGap(discrepancias, 37450, 0)
  assert(r2b.cuadra && r2b.residual === 50, "residual 50 cuadra por tolerancia")

  // partidas entran en la verificación
  const r3 = explicarGap(discrepancias, 37900, 500)
  assert(r3.cuadra, "partidas cierran el residual")

  // lado mayor contribuye con signo invertido
  const r4 = explicarGap([
    d("en_mayor_no_en_extracto", "BCO IMP LEY S/DEB", -50),
    d("en_mayor_no_en_extracto", "BCO IMP LEY S/DEB 2", -70),
  ], 120, 0)
  assert(r4.grupos.length === 1 && r4.grupos[0].lado === "mayor" && r4.grupos[0].total === 120, "lado mayor invierte signo")
  assert(r4.cuadra, "cuadra lado mayor")

  // grupo préstamo pendiente: AMORT + IVAs del mismo grupoId, siempre agrupados
  const dp = (descripcion: string, monto: number, categoria: "prestamo" | "prestamo_iva"): Discrepancia =>
    ({ tipo: "en_extracto_no_en_mayor", fecha: "2026-01-15", descripcion, monto, categoria, grupoId: "g1" })
  const r5 = explicarGap([
    dp("AMORT.S/PRESTAMO OTORG.", -106311097, "prestamo"),
    dp("IVA ALICUOTA GENERAL", -1984142, "prestamo_iva"),
    dp("IVA PERCEPCION", -283449, "prestamo_iva"),
  ], -108578688, 0)
  assert(r5.grupos.length === 1 && r5.grupos[0].esPrestamo === true, "grupo préstamo pendiente")
  assert(r5.grupos[0].items.length === 3 && r5.grupos[0].total === -108578688, "AMORT+IVAs juntos")
  assert(r5.cuadra, "grupo préstamo explica el gap")

  // AMORT solo (sin IVAs) también es grupo, no cuenta suelta
  const r6 = explicarGap([dp("AMORT.S/PRESTAMO OTORG.", -100, "prestamo")], -100, 0)
  assert(r6.grupos.length === 1 && r6.grupos[0].esPrestamo === true, "AMORT solo = grupo préstamo")

  console.log("OK explicar-gap.ts — todos los asserts pasaron")
}
