import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"
import type { ConcStage } from "@/lib/types"
import type { Tx } from "@/lib/conciliacion/persist"
import { currentUserId } from "@/lib/auth/current-user"

export type ConciliacionEntry = {
  id: string
  label: string
  stage: ConcStage
  createdAt: string
  updatedAt: string
  bankId?: string
  bankName?: string
  confidence?: "high" | "low"
  periodo?: string // "YYYY-MM"
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
    periodo: row.periodo ?? undefined,
    saldoAnterior: row.saldoAnterior ?? undefined,
    saldoFinal: row.saldoFinal ?? undefined,
    movimientosCount: row.movimientosCount ?? undefined,
    asientosCount: row.asientosCount ?? undefined,
    saldoBanco: row.saldoBanco ?? undefined,
    diferencia: row.diferencia ?? undefined,
    saldoMayor: row.saldoMayor ?? undefined,
  }
}

export async function listConciliaciones(orgId: string): Promise<ConciliacionEntry[]> {
  const rows = await db.select().from(conciliaciones)
    .where(eq(conciliaciones.orgId, orgId))
    .orderBy(desc(conciliaciones.createdAt))
  return rows.map(rowToEntry)
}

export async function getConciliacion(id: string, orgId: string): Promise<ConciliacionEntry | null> {
  const [row] = await db.select().from(conciliaciones)
    .where(and(eq(conciliaciones.id, id), eq(conciliaciones.orgId, orgId)))
    .limit(1)
  return row ? rowToEntry(row) : null
}

export async function upsertConciliacion(
  id: string,
  patch: Partial<Omit<ConciliacionEntry, "id" | "updatedAt">>,
  orgId: string,
  exec: Tx | typeof db = db
): Promise<void> {
  const now = new Date().toISOString()
  const userId = await currentUserId()

  const values = {
    updatedBy: userId, // último editor (se aplica también en onConflictDoUpdate.set)
    bancoId: patch.bankId,
    bancoNombre: patch.bankName,
    bancoConfidence: patch.confidence,
    periodo: patch.periodo,
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

  await exec.insert(conciliaciones)
    .values({
      id,
      orgId,
      label: patch.label ?? `Conciliación ${new Date().toLocaleDateString("es-AR")}`,
      stage: patch.stage ?? "new",
      createdAt: now,
      createdBy: userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: conciliaciones.id,
      set: values,
      // Si la fila ya existe pero pertenece a otra org, el UPDATE es un no-op
      // (evita que un id ajeno "resucite"/hijackee cross-tenant vía conflicto de PK).
      setWhere: eq(conciliaciones.orgId, orgId),
    })
}

export async function removeConciliacion(id: string, orgId: string): Promise<void> {
  await db.delete(conciliaciones).where(and(eq(conciliaciones.id, id), eq(conciliaciones.orgId, orgId)))
}
