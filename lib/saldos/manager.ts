import { db } from "@/lib/db"
import { saldosBanco } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { currentUserId } from "@/lib/auth/current-user"

export type SaldoBanco = {
  bankId: string
  bankName: string
  ultimoSaldo: number
  ultimaFecha: string
  updatedAt: string
  updatedBy: "auto" | "manual"
  saldoConciliado?: number
  fechaConciliacion?: string
}

function rowToSaldo(row: typeof saldosBanco.$inferSelect): SaldoBanco {
  return {
    bankId: row.bancoId,
    bankName: row.bancoNombre,
    ultimoSaldo: row.ultimoSaldo,
    ultimaFecha: row.ultimaFecha,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy as "auto" | "manual",
    saldoConciliado: row.saldoConciliado ?? undefined,
    fechaConciliacion: row.fechaConciliacion ?? undefined,
  }
}

export async function getSaldos(orgId: string): Promise<Record<string, SaldoBanco>> {
  const rows = await db.select().from(saldosBanco).where(eq(saldosBanco.orgId, orgId))
  return Object.fromEntries(rows.map(r => [r.bancoId, rowToSaldo(r)]))
}

export async function setSaldo(bankId: string, orgId: string, data: Omit<SaldoBanco, "bankId">): Promise<void> {
  const row = {
    bancoId: bankId,
    bancoNombre: data.bankName,
    ultimoSaldo: data.ultimoSaldo,
    ultimaFecha: data.ultimaFecha,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
    updatedByUser: await currentUserId(), // updatedBy de arriba es flag auto|manual; este es el Clerk userId
    saldoConciliado: data.saldoConciliado,
    fechaConciliacion: data.fechaConciliacion,
    orgId,
  }
  await db.insert(saldosBanco)
    .values(row)
    .onConflictDoUpdate({ target: [saldosBanco.orgId, saldosBanco.bancoId], set: row })
}

export async function patchSaldo(bankId: string, orgId: string, patch: { saldoConciliado: number; fechaConciliacion: string }): Promise<void> {
  await db.update(saldosBanco).set({
    saldoConciliado: patch.saldoConciliado,
    fechaConciliacion: patch.fechaConciliacion,
    updatedAt: new Date().toISOString(),
    updatedByUser: await currentUserId(),
  }).where(and(eq(saldosBanco.bancoId, bankId), eq(saldosBanco.orgId, orgId)))
}
