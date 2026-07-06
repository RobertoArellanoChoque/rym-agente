import { db } from "@/lib/db"
import { saldosBanco } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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

export async function getSaldos(): Promise<Record<string, SaldoBanco>> {
  const rows = await db.select().from(saldosBanco)
  return Object.fromEntries(rows.map(r => [r.bancoId, rowToSaldo(r)]))
}

export async function setSaldo(bankId: string, data: Omit<SaldoBanco, "bankId">): Promise<void> {
  const row = {
    bancoId: bankId,
    bancoNombre: data.bankName,
    ultimoSaldo: data.ultimoSaldo,
    ultimaFecha: data.ultimaFecha,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
    saldoConciliado: data.saldoConciliado,
    fechaConciliacion: data.fechaConciliacion,
  }
  await db.insert(saldosBanco)
    .values(row)
    .onConflictDoUpdate({ target: saldosBanco.bancoId, set: row })
}

export async function patchSaldo(bankId: string, patch: { saldoConciliado: number; fechaConciliacion: string }): Promise<void> {
  await db.update(saldosBanco).set({
    saldoConciliado: patch.saldoConciliado,
    fechaConciliacion: patch.fechaConciliacion,
    updatedAt: new Date().toISOString(),
  }).where(eq(saldosBanco.bancoId, bankId))
}
