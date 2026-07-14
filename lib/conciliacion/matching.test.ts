import { describe, it, expect } from "vitest"
import { conciliar, calcularFinanzas } from "@/lib/conciliacion/matching"
import type { Movimiento, Asiento, Discrepancia } from "@/lib/types"

function mov(id: string, fecha: string, monto: number, descripcion = "", referencia = ""): Movimiento {
  return { id, fecha, descripcion, referencia, monto }
}

function asi(id: string, fecha: string, monto: number, descripcion = "", referencia = "", cuenta = "CTA"): Asiento {
  return { id, fecha, descripcion, referencia, monto, cuenta }
}

describe("scorePair (via conciliar)", () => {
  it("requiere monto exacto: 1 centavo de diferencia no matchea", () => {
    const r = conciliar(
      [mov("m1", "2026-01-10", -5000, "PAGO", "F1")],
      [asi("a1", "2026-01-10", -5001, "PAGO", "F1")]
    )
    expect(r.matches).toHaveLength(0)
    expect(r.discrepancias).toHaveLength(2)
  })

  it("tolera hasta 7 días de diferencia de fecha (con bonus de referencia/desc para superar el umbral)", () => {
    const r = conciliar(
      [mov("m1", "2026-01-01", -5000, "PAGO PROVEEDOR", "F1")],
      [asi("a1", "2026-01-08", -5000, "PAGO PROVEEDOR", "F1")] // exactamente 7 días
    )
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]).toMatchObject({ movimientoId: "m1", asientoId: "a1" })
  })

  it("rechaza más de 7 días de diferencia de fecha aunque el resto coincida", () => {
    const r = conciliar(
      [mov("m1", "2026-01-01", -5000, "PAGO PROVEEDOR", "F1")],
      [asi("a1", "2026-01-09", -5000, "PAGO PROVEEDOR", "F1")] // 8 días
    )
    expect(r.matches).toHaveLength(0)
    expect(r.discrepancias).toHaveLength(2)
  })

  it("con dos movimientos candidatos al mismo asiento, gana el de mayor score (fecha exacta + referencia)", () => {
    // Ambos superan el umbral de 50 y compiten por el único asiento disponible;
    // el greedy debe preferir "cerca" (fecha exacta + referencia igual = score 100)
    // sobre "lejos" (3 días de diferencia, sin referencia = score 71).
    const r = conciliar(
      [
        mov("cerca", "2026-01-10", -5000, "PAGO PROVEEDOR ACME", "F1"),
        mov("lejos", "2026-01-13", -5000, "PAGO PROVEEDOR ACME", "X9"),
      ],
      [asi("a1", "2026-01-10", -5000, "PAGO PROVEEDOR ACME", "F1")]
    )
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].movimientoId).toBe("cerca")
    expect(r.matches[0].score).toBe(100)
    // el perdedor queda como discrepancia
    expect(r.discrepancias.some(d => d.movimientoId === "lejos")).toBe(true)
  })
})

describe("conciliar", () => {
  it("matchea lo que corresponde y deja discrepancias determinísticas para 4 movimientos / 4 asientos", () => {
    const movimientos: Movimiento[] = [
      mov("m1", "2026-01-10", -50000, "PAGO PROVEEDOR ACME", "F001"),
      mov("m2", "2026-01-15", 30000, "TRANSFERENCIA RECIBIDA", "TR123"),
      mov("m3", "2026-01-20", -1500, "COMISION MANTENIMIENTO", ""),
      mov("m4", "2026-01-25", -9999, "SIN MATCH BANCO", ""),
    ]
    const asientos: Asiento[] = [
      asi("a1", "2026-01-10", -50000, "PAGO PROVEEDOR ACME SA", "F001", "PROVEEDORES"),
      asi("a2", "2026-01-16", 30000, "TRANSFERENCIA RECIBIDA CLIENTE", "TR123", "CLIENTES"),
      asi("a3", "2026-01-20", -1500, "GASTOS BANCARIOS", "", "GASTOS"),
      asi("a4", "2026-01-25", -7777, "SIN MATCH MAYOR", "", "OTROS"),
    ]

    const r1 = conciliar(movimientos, asientos)
    const r2 = conciliar(movimientos, asientos)

    // determinístico: misma entrada, mismo resultado
    expect(r1).toEqual(r2)

    expect(r1.matches).toHaveLength(3)
    expect(new Set(r1.matches.map(m => m.movimientoId))).toEqual(new Set(["m1", "m2", "m3"]))

    // m4 y a4 no matchean (montos distintos) → quedan como discrepancias
    expect(r1.discrepancias).toHaveLength(2)
    expect(r1.discrepancias.find(d => d.movimientoId === "m4")?.tipo).toBe("en_extracto_no_en_mayor")
    expect(r1.discrepancias.find(d => d.asientoId === "a4")?.tipo).toBe("en_mayor_no_en_extracto")
  })
})

describe("calcularFinanzas", () => {
  it("identidad: diferenciaAjustada = diferencia - sumaPartidas", () => {
    const movimientos = [{ monto: 10000 }, { monto: -2000 }]
    const asientos = [{ monto: 5000 }]
    const discrepancias: Discrepancia[] = [
      { tipo: "en_extracto_no_en_mayor", fecha: "2026-01-01", descripcion: "x", monto: 3000 },
      { tipo: "en_mayor_no_en_extracto", fecha: "2026-01-02", descripcion: "y", monto: 1000 },
    ]
    const sumaPartidas = 500

    const fin = calcularFinanzas(movimientos, asientos, discrepancias, sumaPartidas)

    expect(fin.diferencia).toBe(fin.saldoBanco - fin.saldoMayor - fin.conceptosPendientes + fin.conceptosPendientesTango)
    expect(fin.diferenciaAjustada).toBe(fin.diferencia - sumaPartidas)
  })

  it("diferenciaAjustada es undefined si no se pasa sumaPartidas", () => {
    const fin = calcularFinanzas([{ monto: 100 }], [{ monto: 100 }], [])
    expect(fin.diferencia).toBe(0)
    expect(fin.diferenciaAjustada).toBeUndefined()
  })
})
