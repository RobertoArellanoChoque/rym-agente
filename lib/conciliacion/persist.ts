import { db } from "@/lib/db"
import { matches as matchesTable, discrepancias as discrepanciasTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { Match, Discrepancia } from "@/lib/types"

// Handle de transacción drizzle (para encadenar esta operación en una txn externa).
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Reemplaza matches + discrepancias de una conciliación de forma ATÓMICA.
 * Delete+insert de ambas tablas en una sola transacción: si algo falla, no
 * queda una conciliación a medias (matches borrados con discrepancias viejas).
 *
 * Antes esta lógica estaba duplicada y SIN transacción en comparar/route.ts y
 * en agents/tools/actions.ts (ejecutar_matching).
 */
export async function reemplazarMatchesYDiscrepancias(
  sessionId: string,
  matchesList: Match[],
  discrepanciasList: Discrepancia[],
  exec?: Tx
): Promise<void> {
  // Si ya estamos dentro de una txn (exec), corremos ahí; si no, abrimos una propia.
  const run = async (tx: Tx) => {
    await tx.delete(matchesTable).where(eq(matchesTable.conciliacionId, sessionId))
    await tx.delete(discrepanciasTable).where(eq(discrepanciasTable.conciliacionId, sessionId))

    if (matchesList.length > 0) {
      await tx.insert(matchesTable).values(matchesList.map((m) => ({
        conciliacionId: sessionId,
        movimientoId: m.movimientoId,
        asientoId: m.asientoId,
        score: m.score,
        motivo: m.motivo,
        tipo: m.tipo,
        diferenciaMonto: m.diferenciaMonto ?? null,
        explicacion: m.explicacion ?? null,
      })))
    }

    if (discrepanciasList.length > 0) {
      await tx.insert(discrepanciasTable).values(discrepanciasList.map((d) => ({
        conciliacionId: sessionId,
        tipo: d.tipo,
        fecha: d.fecha,
        descripcion: d.descripcion,
        monto: d.monto,
        movimientoId: d.movimientoId ?? null,
        asientoId: d.asientoId ?? null,
      })))
    }
  }
  if (exec) await run(exec)
  else await db.transaction(run)
}
