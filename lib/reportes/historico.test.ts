import { describe, it, expect } from "vitest"
import { agregarHistorico, type FilaConc } from "@/lib/reportes/historico"

function fila(p: Partial<FilaConc>): FilaConc {
  return {
    id: "c1", label: "L", periodo: "2026-01", bancoId: "b1", bancoNombre: "Galicia",
    saldoBanco: 0, saldoMayor: 0, diferencia: 0, updatedAt: "2026-01-31T00:00:00Z", ...p,
  }
}

describe("agregarHistorico", () => {
  it("agrupa por período y por banco sumando montos, y cuenta filas", () => {
    const r = agregarHistorico([
      fila({ id: "1", periodo: "2026-01", bancoId: "b1", bancoNombre: "Galicia", saldoBanco: 10000, saldoMayor: 9000, diferencia: 1000 }),
      fila({ id: "2", periodo: "2026-01", bancoId: "b2", bancoNombre: "Nación", saldoBanco: 5000, saldoMayor: 5000, diferencia: 0 }),
      fila({ id: "3", periodo: "2026-02", bancoId: "b1", bancoNombre: "Galicia", saldoBanco: 2000, saldoMayor: 1500, diferencia: 500 }),
    ])

    expect(r.porPeriodo).toEqual([
      { periodo: "2026-01", cantidad: 2, totalSaldoBanco: 15000, totalSaldoMayor: 14000, totalDiferencia: 1000 },
      { periodo: "2026-02", cantidad: 1, totalSaldoBanco: 2000, totalSaldoMayor: 1500, totalDiferencia: 500 },
    ])

    const galicia = r.porBanco.find(b => b.bancoId === "b1")!
    expect(galicia).toMatchObject({ cantidad: 2, totalSaldoBanco: 12000, totalSaldoMayor: 10500, totalDiferencia: 1500 })
    expect(r.detalle).toHaveLength(3)
  })

  it("trata montos y campos null como 0 / placeholder sin romper", () => {
    const r = agregarHistorico([
      fila({ id: "1", periodo: null, bancoId: null, bancoNombre: null, saldoBanco: null, saldoMayor: null, diferencia: null }),
    ])
    expect(r.porPeriodo[0]).toMatchObject({ periodo: "—", cantidad: 1, totalSaldoBanco: 0, totalDiferencia: 0 })
    expect(r.porBanco[0]).toMatchObject({ bancoId: "—", bancoNombre: "—", cantidad: 1 })
  })

  it("ordena períodos ascendente (comparación string sobre YYYY-MM)", () => {
    const r = agregarHistorico([
      fila({ id: "1", periodo: "2026-03" }),
      fila({ id: "2", periodo: "2026-01" }),
      fila({ id: "3", periodo: "2025-12" }),
    ])
    expect(r.porPeriodo.map(p => p.periodo)).toEqual(["2025-12", "2026-01", "2026-03"])
  })
})
