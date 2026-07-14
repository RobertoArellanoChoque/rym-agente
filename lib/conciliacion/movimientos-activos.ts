import { db } from "@/lib/db"
import { movimientos as movimientosTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { rowToMovimiento } from "@/lib/conciliacion/mappers"
import type { Movimiento } from "@/lib/types"

// Fuente única de verdad para "movimientos activos" de una conciliación: todo
// caller que carga movimientos para matching/cálculos financieros debe pasar
// por acá (antes cada uno reimplementaba el filtro a mano, y algunos no
// filtraban — un movimiento ya diferido podía resucitar en el matching o
// contabilizarse por duplicado).
//
// Movimientos diferidos al mes siguiente (ver /api/conciliacion/diferir) quedan
// fuera del matching de esta conciliación; su monto se devuelve en
// `sumaDiferidos` para sumarlo a sumaPartidas y que sigan explicando la
// diferencia, igual que una partida manual.
export async function cargarMovimientosActivos(
  conciliacionId: string
): Promise<{ movimientos: Movimiento[]; sumaDiferidos: number }> {
  const rows = await db.select().from(movimientosTable).where(eq(movimientosTable.conciliacionId, conciliacionId))
  const sumaDiferidos = rows.filter(r => r.diferidoA).reduce((s, r) => s + r.monto, 0)
  const movimientos = rows.filter(r => !r.diferidoA).map(rowToMovimiento)
  return { movimientos, sumaDiferidos }
}

// ── self-check ──  ./node_modules/.bin/tsx lib/conciliacion/movimientos-activos.ts
if (process.argv[1] && process.argv[1].endsWith("movimientos-activos.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  assert(typeof cargarMovimientosActivos === "function", "cargarMovimientosActivos exportada")
  assert(cargarMovimientosActivos.constructor.name === "AsyncFunction", "es async")
  console.log("OK movimientos-activos.ts — símbolo y firma correctos")
}
