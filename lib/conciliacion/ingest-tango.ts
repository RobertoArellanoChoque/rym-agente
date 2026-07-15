import { parseTangoExcel, parseTangoCsv } from "@/lib/tango/parser"
import { upsertConciliacion } from "@/lib/conciliacion/registry"
import { periodoDeFechas } from "@/lib/conciliacion/periodo"
import { db } from "@/lib/db"
import { asientos as asientosTable, conciliaciones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireOrgId } from "@/lib/auth/current-user"
import type { Asiento } from "@/lib/types"

export class IngestTangoError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); this.name = "IngestTangoError" }
}

export type MayorTango = {
  asientos: Asiento[]
  saldoMayor?: number
  periodo?: string
}

/** Parsea un mayor de Tango SIN tocar la DB ni requerir sesión. */
export async function extraerTango(buffer: ArrayBuffer, filename: string): Promise<MayorTango> {
  const ext = filename.split(".").pop()?.toLowerCase()
  if (!["xlsx", "xls", "csv"].includes(ext ?? "")) throw new IngestTangoError("UNSUPPORTED_FORMAT")

  let asientos: Asiento[]
  try {
    asientos = ext === "csv" ? await parseTangoCsv(buffer) : await parseTangoExcel(buffer)
  } catch {
    throw new IngestTangoError("PARSE_FAILED")
  }
  if (asientos.length === 0) throw new IngestTangoError("EMPTY")

  const saldoMayor = [...asientos]
    .filter(a => a.saldo !== undefined)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .at(-1)?.saldo
  const periodo = periodoDeFechas(asientos.map(a => a.fecha))

  return { asientos, saldoMayor, periodo }
}

/** Persiste un mayor extraído en una sesión existente. */
export async function persistTango(sessionId: string, mayor: MayorTango): Promise<void> {
  const orgId = await requireOrgId()
  // Defensivo: mismo chequeo que persistBanco — no pisar una sesión de otra org.
  const [existing] = await db.select({ orgId: conciliaciones.orgId }).from(conciliaciones)
    .where(eq(conciliaciones.id, sessionId)).limit(1)
  if (existing?.orgId && existing.orgId !== orgId) {
    throw new Error("La sesión pertenece a otra organización")
  }

  await db.transaction(async (tx) => {
    await tx.delete(asientosTable).where(eq(asientosTable.conciliacionId, sessionId))
    if (mayor.asientos.length > 0) {
      await tx.insert(asientosTable).values(mayor.asientos.map(a => ({
        id: a.id, conciliacionId: sessionId, fecha: a.fecha, descripcion: a.descripcion,
        referencia: a.referencia, monto: a.monto, cuenta: a.cuenta,
        debe: a.debe ?? null, haber: a.haber ?? null, saldo: a.saldo ?? null,
      })))
    }
  })

  await upsertConciliacion(sessionId, {
    stage: "tango-done",
    asientosCount: mayor.asientos.length,
    saldoMayor: mayor.saldoMayor,
    ...(mayor.periodo && { periodo: mayor.periodo }),
  }, orgId)
}
