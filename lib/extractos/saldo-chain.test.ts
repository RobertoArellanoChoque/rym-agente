import { describe, it, expect } from "vitest"
import { repararConCadenaDeSaldos } from "@/lib/extractos/saldo-chain"
import type { Movimiento } from "@/lib/types"

function mov(id: string, monto: number, saldo: number, fecha = "2026-01-15"): Movimiento {
  return { id, fecha, descripcion: id, referencia: "", monto, saldo }
}

describe("repararConCadenaDeSaldos", () => {
  it("detecta convención post-op y no reporta correcciones si el extracto ya está limpio", () => {
    // 1000 → +100=1100 → −300=800 → +250=1050
    const post = [mov("a", 100, 1100), mov("b", -300, 800), mov("c", 250, 1050)]
    const r = repararConCadenaDeSaldos(post, 1000, 1050)
    expect(r.convencion).toBe("post")
    expect(r.correcciones).toHaveLength(0)
    expect(r.inconsistencias).toHaveLength(0)
    expect(r.residual).toBe(0)
    expect(r.movimientos.map(m => m.id)).toEqual(["a", "b", "c"])
  })

  it("detecta convención pre-op (Patagonia) y ordena por cadena", () => {
    const pre = [mov("a", 100, 1000), mov("b", -300, 1100), mov("c", 250, 800)]
    const r = repararConCadenaDeSaldos(pre, 1000, 1050)
    expect(r.convencion).toBe("pre")
    expect(r.correcciones).toHaveLength(0)
    expect(r.movimientos.map(m => m.id)).toEqual(["a", "b", "c"])
  })

  it("corrige un signo invertido por OCR (post-op)", () => {
    // b debería ser −300 pero vino como +300
    const postInv = [mov("a", 100, 1100), mov("b", 300, 800), mov("c", 250, 1050)]
    const r = repararConCadenaDeSaldos(postInv, 1000, 1050)
    expect(r.correcciones).toHaveLength(1)
    expect(r.movimientos.find(m => m.id === "b")?.monto).toBe(-300)
    expect(r.residual).toBe(0)
  })

  it("detecta una fila faltante (hueco de OCR) como inconsistencia y reporta el residual", () => {
    const conHueco = [mov("a", 100, 1100), mov("d", 30, 1110)]
    const r = repararConCadenaDeSaldos(conHueco, 1000, 1110)
    expect(r.inconsistencias).toHaveLength(1)
    expect(r.residual).toBe((1110 - 1000) - 130)
  })
})
