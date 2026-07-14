import crypto from "crypto"
import type { Movimiento } from "@/lib/types"

/**
 * Agrupa débitos de préstamo con sus impuestos relacionados (Banco Patagonia).
 *
 * En el extracto, el pago de un préstamo aparece como líneas CONSECUTIVAS:
 *   AMORT.S/PRESTAMO OTORG.  →  IVA ALICUOTA GENERAL  →  IVA PERCEPCION
 *   (a veces + IMPUESTO A LOS SELLOS)
 * y en Tango como UN asiento combinado por la suma exacta.
 *
 * Requiere movimientos EN ORDEN de extracto (usar repararConCadenaDeSaldos
 * antes). La adyacencia manda: un IVA que sigue a una COMISION el mismo día NO
 * es del préstamo (caso real 16/01: COMISION+IVA 630+90 vs AMORT+IVA 6.429,88).
 */

const RE_AMORT = /AMORT.*PR[EÉ]STAMO|AMORT\.?S?\/?PRESTAMO/i
const RE_IMPUESTO_RELACIONADO = /IVA\s+ALICUOTA|IVA\s+PERCEPCION|IMPUESTO\s+A\s+LOS\s+SELLOS/i

export function tagGruposPrestamo(movimientos: Movimiento[]): Movimiento[] {
  // Bidireccional: según el banco/orden (papel reverse-chrono vs cronológico),
  // los impuestos del préstamo pueden quedar ANTES o DESPUÉS de la AMORT.
  // Pasada forward absorbe los de después; si un AMORT queda solo, pasada
  // reverse absorbe los adyacentes anteriores. La adyacencia siempre manda.
  const out: Movimiento[] = [...movimientos]

  // forward
  let grupoActual: string | null = null
  let fechaGrupo = ""
  const grupoTieneImpuestos = new Map<string, boolean>()
  const grupoDeAmort = new Map<number, string>() // idx del AMORT → grupoId
  for (let i = 0; i < out.length; i++) {
    const m = out[i]
    if (RE_AMORT.test(m.descripcion)) {
      grupoActual = crypto.randomUUID()
      fechaGrupo = m.fecha
      grupoTieneImpuestos.set(grupoActual, false)
      grupoDeAmort.set(i, grupoActual)
      out[i] = { ...m, categoria: "prestamo", grupoId: grupoActual }
      continue
    }
    if (grupoActual && m.fecha === fechaGrupo && RE_IMPUESTO_RELACIONADO.test(m.descripcion)) {
      grupoTieneImpuestos.set(grupoActual, true)
      out[i] = { ...m, categoria: "prestamo_iva", grupoId: grupoActual }
      continue
    }
    grupoActual = null // cualquier otra línea corta el grupo
  }

  // reverse: AMORT sin impuestos hacia adelante → buscar adyacentes hacia atrás
  for (const [idx, gid] of grupoDeAmort) {
    if (grupoTieneImpuestos.get(gid)) continue
    for (let j = idx - 1; j >= 0; j--) {
      const m = out[j]
      if (m.grupoId) break // ya pertenece a otro grupo
      if (m.fecha !== out[idx].fecha || !RE_IMPUESTO_RELACIONADO.test(m.descripcion)) break
      out[j] = { ...m, categoria: "prestamo_iva", grupoId: gid }
    }
  }

  return out
}

// ── self-check ──  ./node_modules/.bin/tsx lib/extractos/prestamos.ts
if (process.argv[1] && process.argv[1].endsWith("prestamos.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  const mov = (descripcion: string, monto: number, fecha = "2026-01-16"): Movimiento =>
    ({ id: descripcion + monto, fecha, descripcion, referencia: "", monto })

  // Secuencia real 16/01 Patagonia: comisión con su IVA ANTES, préstamo con sus IVAs DESPUÉS
  const dia16 = tagGruposPrestamo([
    mov("COMISION TRANSF.E/CUENTAS", -300000),
    mov("IVA ALICUOTA GENERAL", -63000),        // IVA de la comisión — NO préstamo
    mov("IVA PERCEPCION", -9000),               // idem
    mov("IMP.DB/CR BANCARIOS P/DEBITOS", -229875),
    mov("AMORT.S/PRESTAMO OTORG.", -179390954),
    mov("IVA ALICUOTA GENERAL", -642988),       // IVA del préstamo ✓
    mov("IVA PERCEPCION", -91855),              // idem ✓
    mov("IMP.DB/CR BANCARIOS P/DEBITOS", -1080755),
  ])
  assert(dia16[1].categoria === undefined && dia16[1].grupoId === undefined, "IVA de comisión NO entra al grupo")
  assert(dia16[4].categoria === "prestamo", "AMORT taggeada")
  assert(dia16[5].categoria === "prestamo_iva" && dia16[5].grupoId === dia16[4].grupoId, "IVA AG del préstamo agrupa")
  assert(dia16[6].categoria === "prestamo_iva" && dia16[6].grupoId === dia16[4].grupoId, "IVA PERC del préstamo agrupa")
  assert(dia16[7].categoria === undefined, "IMP.DB/CR corta el grupo")

  // 22/01: sellos adyacente entra al grupo (cierra exacto vs mayor)
  const dia22 = tagGruposPrestamo([
    mov("AMORT.S/PRESTAMO OTORG.", -193131516, "2026-01-22"),
    mov("IVA ALICUOTA GENERAL", -7088795, "2026-01-22"),
    mov("IVA PERCEPCION", -1012685, "2026-01-22"),
    mov("IMPUESTO A LOS SELLOS", -2250411, "2026-01-22"),
  ])
  assert(dia22.every(m => m.grupoId === dia22[0].grupoId), "AMORT+IVAs+sellos un solo grupo")
  assert(dia22.reduce((s, m) => s + m.monto, 0) === -203483407, "suma grupo 22/01 = asiento Tango")

  // Cambio de fecha corta el grupo
  const cruzaFecha = tagGruposPrestamo([
    mov("AMORT.S/PRESTAMO OTORG.", -100, "2026-01-21"),
    mov("IVA ALICUOTA GENERAL", -21, "2026-01-22"),
  ])
  assert(cruzaFecha[1].categoria === undefined, "IVA de otra fecha no agrupa")

  // Dos préstamos el mismo día → dos grupos distintos
  const dosGrupos = tagGruposPrestamo([
    mov("AMORT.S/PRESTAMO OTORG.", -100),
    mov("IVA ALICUOTA GENERAL", -21),
    mov("AMORT.S/PRESTAMO OTORG.", -200),
    mov("IVA PERCEPCION", -3),
  ])
  assert(dosGrupos[0].grupoId !== dosGrupos[2].grupoId, "dos AMORT = dos grupos")
  assert(dosGrupos[3].grupoId === dosGrupos[2].grupoId, "IVA va al grupo más cercano")

  // Orden cronológico (impuestos ANTES del AMORT, caso real 16/01 reconstruido):
  // la pasada reverse los absorbe; los IVAs de la comisión quedan fuera.
  const crono = tagGruposPrestamo([
    mov("IMP.DB/CR BANCARIOS P/DEBITOS", -1080755),
    mov("IVA PERCEPCION", -91855),
    mov("IVA ALICUOTA GENERAL", -642988),
    mov("AMORT.S/PRESTAMO OTORG.", -179390954),
    mov("IMP.DB/CR BANCARIOS P/DEBITOS", -229875),
    mov("IVA PERCEPCION", -9000),
    mov("IVA ALICUOTA GENERAL", -63000),
    mov("COMISION TRANSF.E/CUENTAS", -300000),
  ])
  assert(crono[3].categoria === "prestamo", "crono: AMORT taggeada")
  assert(crono[1].grupoId === crono[3].grupoId && crono[2].grupoId === crono[3].grupoId, "crono: IVAs previos absorbidos")
  assert(crono[0].grupoId === undefined, "crono: IMP.DB corta hacia atrás")
  assert(crono[5].grupoId === undefined && crono[6].grupoId === undefined, "crono: IVAs de comisión fuera")

  console.log("OK prestamos.ts — todos los asserts pasaron")
}
