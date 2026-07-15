import { describe, it, expect } from "vitest"
import {
  esDiscrepanciaGrande, esSaldoNegativo, esStale,
  ALERTA_DISCREPANCIA_MIN, ALERTA_STALE_DIAS,
} from "@/lib/alertas"

const DIA = 86_400_000

describe("esDiscrepanciaGrande", () => {
  it("dispara con |monto| estrictamente mayor al umbral, en ambos signos", () => {
    expect(esDiscrepanciaGrande(ALERTA_DISCREPANCIA_MIN + 1)).toBe(true)
    expect(esDiscrepanciaGrande(-(ALERTA_DISCREPANCIA_MIN + 1))).toBe(true)
  })
  it("no dispara en el umbral exacto ni por debajo", () => {
    expect(esDiscrepanciaGrande(ALERTA_DISCREPANCIA_MIN)).toBe(false)
    expect(esDiscrepanciaGrande(ALERTA_DISCREPANCIA_MIN - 1)).toBe(false)
    expect(esDiscrepanciaGrande(0)).toBe(false)
  })
})

describe("esSaldoNegativo", () => {
  it("solo dispara con saldo estrictamente menor a cero", () => {
    expect(esSaldoNegativo(-1)).toBe(true)
    expect(esSaldoNegativo(0)).toBe(false)
    expect(esSaldoNegativo(1)).toBe(false)
  })
})

describe("esStale", () => {
  const ahora = Date.parse("2026-07-15T12:00:00Z")
  it("dispara cuando updatedAt es más viejo que el umbral", () => {
    const viejo = new Date(ahora - (ALERTA_STALE_DIAS + 1) * DIA).toISOString()
    expect(esStale(viejo, ahora)).toBe(true)
  })
  it("no dispara dentro de la ventana", () => {
    const reciente = new Date(ahora - (ALERTA_STALE_DIAS - 1) * DIA).toISOString()
    expect(esStale(reciente, ahora)).toBe(false)
  })
  it("no dispara justo en el borde del umbral (no estricto)", () => {
    const borde = new Date(ahora - ALERTA_STALE_DIAS * DIA).toISOString()
    expect(esStale(borde, ahora)).toBe(false)
  })
})
