import { getConciliacion } from "@/lib/conciliacion/registry"
import { patchSaldo } from "@/lib/saldos/manager"
import { centavosAString, TOLERANCIA_CUADRE } from "@/lib/conciliacion/matching"
import { siguientePeriodo } from "@/lib/conciliacion/periodo"
import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { currentUserId } from "@/lib/auth/current-user"

export type ApproveResult =
  | {
      ok: true; sessionId: string; conciliacion: string; saldoConciliado: string
      // Datos para encadenar el mes siguiente (Fase B). periodo puede faltar si el extracto no tenía fechas.
      bankId?: string; bankName?: string; periodo?: string; siguientePeriodo?: string; saldoFinal?: number
    }
  | { error: string; diferencia?: string; hint?: string }

export async function approveConciliacion(
  sessionId: string,
  aceptarDiferencia = false,
): Promise<ApproveResult> {
  const session = await getConciliacion(sessionId)
  if (!session) return { error: "Sesión no encontrada" }

  if (session.stage !== "done") {
    return { error: `No se puede aprobar. Stage: ${session.stage}, requerido: done (ejecutar matching primero)` }
  }

  if (session.diferencia !== undefined && Math.abs(session.diferencia) > TOLERANCIA_CUADRE && !aceptarDiferencia) {
    return {
      error: "Conciliación tiene diferencia residual",
      diferencia: centavosAString(session.diferencia),
      hint: "Enviá aceptarDiferencia=true para aprobar con diferencia.",
    }
  }

  if (session.bankId && session.saldoFinal != null) {
    await patchSaldo(session.bankId, {
      saldoConciliado: session.saldoFinal,
      fechaConciliacion: new Date().toISOString(),
    })
  }

  // Archiva la conciliación: sale de "Tareas activas" (GET /api/tasks la excluye).
  await db.update(conciliaciones)
    .set({ stage: "aprobada", updatedAt: new Date().toISOString(), updatedBy: await currentUserId() })
    .where(eq(conciliaciones.id, sessionId))

  return {
    ok: true,
    sessionId,
    conciliacion: `${session.bankName} — ${session.label}`,
    saldoConciliado: centavosAString(session.saldoFinal ?? 0),
    bankId: session.bankId,
    bankName: session.bankName,
    periodo: session.periodo,
    siguientePeriodo: session.periodo ? siguientePeriodo(session.periodo) : undefined,
    saldoFinal: session.saldoFinal,
  }
}
