import { describe, it, expect } from "vitest"
import { categoriaEfectiva } from "@/lib/conciliacion/agrupar-categorias"
import type { Discrepancia } from "@/lib/types"

function d(descripcion: string, monto: number, extra: Partial<Discrepancia> = {}): Discrepancia {
  return { tipo: "en_extracto_no_en_mayor", fecha: "2026-01-15", descripcion, monto, ...extra }
}

describe("categoriaEfectiva: prioridad bucketOverride > préstamo > operativo > impuesto", () => {
  it("bucketOverride gana incluso sobre un ítem que es un préstamo", () => {
    const item = d("AMORT.S/PRESTAMO OTORG.", -1000, { categoria: "prestamo", grupoId: "g1", bucketOverride: "Otros" })
    expect(categoriaEfectiva(item)).toBe("Otros")
  })

  it("préstamo gana sobre la clasificación de impuesto de su descripción", () => {
    // La descripción por sí sola clasificaría como "IVA", pero la categoría prestamo_iva manda
    const item = d("IVA ALICUOTA GENERAL", -1000, { categoria: "prestamo_iva", grupoId: "g1" })
    expect(categoriaEfectiva(item)).toBe("Préstamos")
  })

  it("no impositivo (sin préstamo/override) cae en Operativos", () => {
    const item = d("TRANSFERENCIA ENTRE CUENTAS", -38000)
    expect(categoriaEfectiva(item)).toBe("Operativos")
  })

  it("sin préstamo/override/operativo, usa el bucket de impuesto de la descripción", () => {
    const item = d("IVA ALICUOTA GENERAL", -10000)
    expect(categoriaEfectiva(item)).toBe("IVA")
  })
})
