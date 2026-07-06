import { getConciliacion } from "@/lib/conciliacion/registry"
import { patchSaldo } from "@/lib/saldos/manager"
import { centavosAString } from "@/lib/conciliacion/matching"

export type ApproveResult =
  | { ok: true; sessionId: string; conciliacion: string; saldoConciliado: string }
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

  if (session.diferencia !== 0 && session.diferencia !== undefined && !aceptarDiferencia) {
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

  return {
    ok: true,
    sessionId,
    conciliacion: `${session.bankName} — ${session.label}`,
    saldoConciliado: centavosAString(session.saldoFinal ?? 0),
  }
}
