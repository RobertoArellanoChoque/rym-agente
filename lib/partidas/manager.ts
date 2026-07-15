import { db } from "@/lib/db"
import { partidas as partidasTable } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { currentUserId } from "@/lib/auth/current-user"

export type Partida = {
  id: string
  descripcion: string
  monto: number
  fecha: string
}

export async function getPartidas(bankId: string, orgId: string): Promise<Partida[]> {
  const rows = await db.select().from(partidasTable)
    .where(and(eq(partidasTable.bancoId, bankId), eq(partidasTable.orgId, orgId)))
  return rows.map(r => ({
    id: r.id,
    descripcion: r.descripcion,
    monto: r.monto,
    fecha: r.fecha,
  }))
}

export async function setPartidas(bankId: string, orgId: string, items: Partida[]): Promise<void> {
  const userId = await currentUserId()
  await db.transaction(async (tx) => {
    await tx.delete(partidasTable).where(and(eq(partidasTable.bancoId, bankId), eq(partidasTable.orgId, orgId)))
    if (items.length > 0) {
      await tx.insert(partidasTable).values(items.map(p => ({
        id: p.id,
        bancoId: bankId,
        descripcion: p.descripcion,
        monto: p.monto,
        fecha: p.fecha,
        createdBy: userId,
        orgId,
      })))
    }
  })
}
