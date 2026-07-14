import { describe, it, expect } from "vitest"
import { periodoDeFechas, siguientePeriodo } from "@/lib/conciliacion/periodo"

describe("periodoDeFechas", () => {
  it("devuelve el mes con más ocurrencias (moda)", () => {
    expect(periodoDeFechas(["2026-01-05", "2026-01-20", "2026-02-01"])).toBe("2026-01")
  })

  it("devuelve undefined para un array vacío", () => {
    expect(periodoDeFechas([])).toBeUndefined()
  })

  it("ignora fechas inválidas/undefined", () => {
    expect(periodoDeFechas(["basura", undefined, "2026-03-10"])).toBe("2026-03")
  })

  it("en un empate, gana el primero encontrado", () => {
    expect(periodoDeFechas(["2026-01-01", "2026-02-01"])).toBe("2026-01")
    expect(periodoDeFechas(["2026-02-01", "2026-01-01"])).toBe("2026-02")
  })
})

describe("siguientePeriodo", () => {
  it("suma un mes dentro del mismo año", () => {
    expect(siguientePeriodo("2026-01")).toBe("2026-02")
    expect(siguientePeriodo("2026-06")).toBe("2026-07")
  })

  it("diciembre pasa a enero del año siguiente", () => {
    expect(siguientePeriodo("2026-12")).toBe("2027-01")
  })

  it("input inválido se devuelve sin cambios", () => {
    expect(siguientePeriodo("no-es-un-periodo")).toBe("no-es-un-periodo")
  })
})
