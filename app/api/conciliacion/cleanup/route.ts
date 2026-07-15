import { NextRequest, NextResponse } from "next/server"
import { cleanupSession, sessionExists } from "@/lib/sessions/manager"
import { getConciliacion, removeConciliacion } from "@/lib/conciliacion/registry"
import { requireOrgId } from "@/lib/auth/current-user"
import { db } from "@/lib/db"
import { movimientos, movimientosDiferidos } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { sessionId } = body as { sessionId?: string }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
  }

  let orgId: string
  try {
    orgId = await requireOrgId()
  } catch {
    return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
  }

  // Ownership check ANTES de tocar cleanupSession/sessionExists (lib/sessions/manager —
  // fuera de este scope de archivos): esas funciones borran/leen por id SIN filtrar por
  // orgId. Si no cortamos acá, un sessionId de otra org "ya gone" (204) evita el 404 pero
  // seguiría siendo borrable vía cleanupSession más abajo. Tratamos "no es mío" igual que
  // "ya no existe" — mismo código de respuesta (204), no distingue los dos casos.
  const owned = await getConciliacion(sessionId, orgId)
  if (!owned) {
    return new NextResponse(null, { status: 204 })
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

  try { await removeConciliacion(sessionId, orgId) } catch { /* already gone */ }

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
