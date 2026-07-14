import type { ResultadoConciliacion, Discrepancia } from "@/lib/types"
import { agruparPorCategoria } from "@/lib/conciliacion/agrupar-categorias"

/**
 * Deriva los asientos que habría que SUBIR a Tango a partir de una conciliación
 * aprobada. Toma las discrepancias "en_extracto_no_en_mayor" (movimientos del
 * banco que faltan asentar), excluye préstamos, y las acumula por categoría
 * (una fila por bucket) en formato de columnas del mayor Tango.
 *
 * Datos reales: fecha, leyenda, montos por categoría. Placeholders (x/X…) donde
 * Tango asignaría el dato al importar (N_COMP, BARRA, SALDO corrido).
 */

export const TANGO_HEADERS = [
  "COD_MONEDA", "SIGLA_MONE", "DESC_MONE", "FECHA", "COD_COMP",
  "N_COMP", "BARRA", "LEYENDA", "DEBE", "HABER", "SALDO",
] as const

export type AsientoTango = {
  codMoneda: string
  siglaMone: string
  descMone: string
  fecha: string      // DD/MM/YYYY
  codComp: string    // AJU | DEP | LEY | O/P | GBA
  nComp: string      // placeholder X…
  barra: string      // placeholder 0
  leyenda: string
  debe: string       // formato Tango US: 1,234.56
  haber: string
  saldo: string      // saldo corrido de ejemplo
}

// ── Formatos Tango ────────────────────────────────────────────────────────────

// centavos → "1,234.56" (coma miles, punto decimal — formato del mayor Tango)
function fmtTango(centavos: number): string {
  const abs = Math.abs(centavos)
  const entero = Math.floor(abs / 100)
  const dec = String(abs % 100).padStart(2, "0")
  const sep = entero.toLocaleString("en-US")
  return `${centavos < 0 ? "-" : ""}${sep}.${dec}`
}

// ISO YYYY-MM-DD → DD/MM/YYYY (placeholder si vacío/inválido)
function fechaTango(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "")
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "x"
}

// ── Reglas de negocio ─────────────────────────────────────────────────────────

const esPrestamo = (d: Discrepancia) =>
  d.categoria === "prestamo" || d.categoria === "prestamo_iva" || !!d.grupoId

// Categorías de impuesto "ley" (COD_COMP=LEY, leyenda "BCA {BANCO}")
const CATEGORIAS_LEY = new Set([
  "IVA", "Ingresos Brutos CABA", "Ingresos Brutos ARBA", "IIBB",
  "Impuesto Ley 25.413", "Ley 25413", "Sellos", "Percepciones",
])

function esLey(categoria: string): boolean {
  if (CATEGORIAS_LEY.has(categoria)) return true
  const c = categoria.toLowerCase()
  return c.includes("iva") || c.includes("iibb") || c.includes("ingresos brutos") ||
    c.includes("ley") || c.includes("sello") || c.includes("percep") || c.includes("impuesto")
}

// COD_COMP por categoría. LEY para impuestos; resto según tipo (placeholder ajustable).
function mapCodComp(categoria: string): string {
  if (esLey(categoria)) return "LEY"
  const c = categoria.toLowerCase()
  if (c.includes("operativ")) return "O/P"
  if (c.includes("deposit") || c.includes("cobro") || c.includes("ingreso")) return "DEP"
  if (c.includes("ajuste")) return "AJU"
  return "GBA" // default placeholder
}

export function abrevBanco(bankName?: string): string {
  const n = (bankName ?? "").toUpperCase()
  if (n.includes("BBVA")) return "BBVA"
  if (n.includes("GALICIA")) return "GALICIA"
  if (n.includes("SANTANDER")) return "SANTANDER"
  return n || "x"
}

// ── Construcción ──────────────────────────────────────────────────────────────

export function construirAsientosTango(
  resultado: ResultadoConciliacion,
  bankName?: string,
): AsientoTango[] {
  const pendientes = resultado.discrepancias.filter(
    d => d.tipo === "en_extracto_no_en_mayor" && !esPrestamo(d),
  )
  const secciones = agruparPorCategoria(pendientes)

  const abrev = abrevBanco(bankName)
  let saldoCorrido = 0
  return secciones.map((sec, i) => {
    saldoCorrido += sec.total
    const ley = esLey(sec.categoria)
    // sec.total ya viene con signo de contribución (extracto → +monto)
    const debe = sec.total > 0 ? fmtTango(sec.total) : "0.00"
    const haber = sec.total < 0 ? fmtTango(-sec.total) : "0.00"
    const fechaRep = sec.items[sec.items.length - 1]?.fecha ?? ""
    return {
      codMoneda: "CTE",
      siglaMone: "$",
      descMone: "Moneda Corriente",
      fecha: fechaTango(fechaRep),
      codComp: mapCodComp(sec.categoria),
      nComp: `X${String(i + 1).padStart(4, "0")}`,
      barra: "0",
      leyenda: ley ? `BCA ${abrev}` : sec.categoria,
      debe,
      haber,
      saldo: fmtTango(saldoCorrido),
    }
  })
}

export function asientosToCsv(rows: AsientoTango[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [TANGO_HEADERS.join(",")]
  for (const r of rows) {
    lines.push([
      r.codMoneda, r.siglaMone, r.descMone, r.fecha, r.codComp,
      r.nComp, r.barra, r.leyenda, r.debe, r.haber, r.saldo,
    ].map(esc).join(","))
  }
  return lines.join("\n")
}

// ── self-check ──  ./node_modules/.bin/tsx lib/conciliacion/asientos-tango.ts
if (process.argv[1] && process.argv[1].endsWith("asientos-tango.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  const d = (descripcion: string, monto: number, extra: Partial<Discrepancia> = {}): Discrepancia =>
    ({ tipo: "en_extracto_no_en_mayor", fecha: "2026-01-15", descripcion, monto, ...extra })

  const res: ResultadoConciliacion = {
    matches: [], movimientos: [], asientos: [],
    saldoBanco: 0, saldoMayor: 0, conceptosPendientes: 0, conceptosPendientesTango: 0,
    diferencia: 0, candidatosAConciliarIds: [],
    discrepancias: [
      d("IVA ALICUOTA GENERAL", -10000),
      d("IVA RG 2408", -5000),
      d("AMORT.S/PRESTAMO OTORG.", -100000, { grupoId: "g1", categoria: "prestamo" }),
      d("IVA S/PRESTAMO", -3000, { categoria: "prestamo_iva" }),
      d("TRANSFERENCIA ENTRE CUENTAS", 38000),
      d("COBRO CLIENTE", 12000, { tipo: "en_mayor_no_en_extracto" }),
    ],
  }

  const rows = construirAsientosTango(res, "BBVA Banco Francés")

  // préstamos y su IVA excluidos; en_mayor_no_en_extracto excluido
  assert(!rows.some(r => r.leyenda.includes("PRESTAMO")), "préstamos excluidos")
  const iva = rows.find(r => r.leyenda === "BCA BBVA" && r.codComp === "LEY")
  assert(!!iva, "IVA agrupa como LEY con leyenda BCA BBVA")
  assert(iva!.haber === "150.00" && iva!.debe === "0.00", "IVA -15000 centavos → HABER 150.00")
  const oper = rows.find(r => r.leyenda === "Operativos")
  assert(!!oper && oper!.debe === "380.00" && oper!.haber === "0.00", "Operativos +38000 → DEBE 380.00")
  assert(oper!.codComp === "O/P", "Operativos → COD_COMP O/P")
  assert(rows.every(r => /^\d{2}\/\d{2}\/\d{4}$/.test(r.fecha)), "fechas DD/MM/YYYY")

  // CSV: header + N filas
  const csv = asientosToCsv(rows)
  assert(csv.split("\n").length === rows.length + 1, "CSV = header + filas")
  assert(csv.startsWith("COD_MONEDA,SIGLA_MONE"), "CSV empieza con headers Tango")

  console.log("OK asientos-tango.ts — todos los asserts pasaron")
}
