import type { movimientos as movimientosTable, asientos as asientosTable } from "@/lib/db/schema"
import type { Movimiento, Asiento } from "@/lib/types"

// Mapeos row→objeto de dominio, antes duplicados en contabilizar/actions/comparar/state.
export function rowToMovimiento(r: typeof movimientosTable.$inferSelect): Movimiento {
  return {
    id: r.id, fecha: r.fecha, descripcion: r.descripcion, referencia: r.referencia,
    monto: r.monto, saldo: r.saldo ?? undefined, categoria: r.categoria as Movimiento["categoria"],
    grupoId: r.grupoId ?? undefined,
  }
}

export function rowToAsiento(r: typeof asientosTable.$inferSelect): Asiento {
  return {
    id: r.id, fecha: r.fecha, descripcion: r.descripcion, referencia: r.referencia,
    monto: r.monto, cuenta: r.cuenta, debe: r.debe ?? undefined, haber: r.haber ?? undefined, saldo: r.saldo ?? undefined,
  }
}
