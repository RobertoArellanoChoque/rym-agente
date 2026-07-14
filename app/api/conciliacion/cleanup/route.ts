import { NextRequest, NextResponse } from "next/server"
import { cleanupSession, sessionExists } from "@/lib/sessions/manager"
import { removeConciliacion } from "@/lib/conciliacion/registry"
import { db } from "@/lib/db"
import { movimientos, movimientosDiferidos } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { sessionId } = body as { sessionId?: string }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
  }

  // Guard: no borrar si algún diferido resuelto quedó vinculado (conciliadoEnMovimientoId)
  // a un movimiento de ESTA conciliación — borrarla lo dejaría en un estado inconsistente.
  const [referenciado] = await db.select({ id: movimientosDiferidos.id }).from(movimientosDiferidos)
    .innerJoin(movimientos, eq(movimientosDiferidos.conciliadoEnMovimientoId, movimientos.id))
    .where(and(eq(movimientos.conciliacionId, sessionId), eq(movimientosDiferidos.estado, "conciliado")))
    .limit(1)
  if (referenciado) {
    return NextResponse.json(
      { error: "No se puede eliminar: tiene un movimiento vinculado a un diferido ya resuelto" },
      { status: 409 }
    )
  }

  try { await removeConciliacion(sessionId) } catch { /* already gone */ }

  if (!(await sessionExists(sessionId))) {
    return new NextResponse(null, { status: 204 }) // already gone, ok
  }

  try {
    await cleanupSession(sessionId)
    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: "Error eliminando sesión" }, { status: 500 })
  }
}
