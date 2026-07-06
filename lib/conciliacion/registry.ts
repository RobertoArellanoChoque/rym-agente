import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import type { ConcStage } from "@/lib/types"

export type ConciliacionEntry = {
  id: string
  label: string
  stage: ConcStage
  createdAt: string
  updatedAt: string
  bankId?: string
  bankName?: string
  confidence?: "high" | "low"
  saldoAnterior?: number
  saldoFinal?: number
  movimientosCount?: number
  asientosCount?: number
  saldoBanco?: number
  diferencia?: number
  saldoMayor?: number
}

function rowToEntry(row: typeof conciliaciones.$inferSelect): ConciliacionEntry {
  return {
    id: row.id,
    label: row.label,
    stage: row.stage as ConcStage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    bankId: row.bancoId ?? undefined,
    bankName: row.bancoNombre ?? undefined,
    confidence: (row.bancoConfidence as "high" | "low") ?? undefined,
    saldoAnterior: row.saldoAnterior ?? undefined,
    saldoFinal: row.saldoFinal ?? undefined,
    movimientosCount: row.movimientosCount ?? undefined,
    asientosCount: row.asientosCount ?? undefined,
    saldoBanco: row.saldoBanco ?? undefined,
    diferencia: row.diferencia ?? undefined,
    saldoMayor: row.saldoMayor ?? undefined,
  }
}

export async function listConciliaciones(): Promise<ConciliacionEntry[]> {
  const rows = await db.select().from(conciliaciones).orderBy(desc(conciliaciones.createdAt))
  return rows.map(rowToEntry)
}

export async function getConciliacion(id: string): Promise<ConciliacionEntry | null> {
  const [row] = await db.select().from(conciliaciones).where(eq(conciliaciones.id, id)).limit(1)
  return row ? rowToEntry(row) : null
}

export async function upsertConciliacion(
  id: string,
  patch: Partial<Omit<ConciliacionEntry, "id" | "updatedAt">>
): Promise<void> {
  const now = new Date().toISOString()

  const values = {
    bancoId: patch.bankId,
    bancoNombre: patch.bankName,
    bancoConfidence: patch.confidence,
    saldoAnterior: patch.saldoAnterior,
    saldoFinal: patch.saldoFinal,
    movimientosCount: patch.movimientosCount,
    asientosCount: patch.asientosCount,
    saldoBanco: patch.saldoBanco,
    diferencia: patch.diferencia,
    saldoMayor: patch.saldoMayor,
    updatedAt: now,
    ...(patch.stage && { stage: patch.stage }),
    ...(patch.label && { label: patch.label }),
  }

  await db.insert(conciliaciones)
    .values({
      id,
      label: patch.label ?? `Conciliación ${new Date().toLocaleDateString("es-AR")}`,
      stage: patch.stage ?? "new",
      createdAt: now,
      ...values,
    })
    .onConflictDoUpdate({ target: conciliaciones.id, set: values })
}

export async function removeConciliacion(id: string): Promise<void> {
  await db.delete(conciliaciones).where(eq(conciliaciones.id, id))
}
