import { NextRequest, NextResponse } from "next/server"
import { cleanupSession, sessionExists } from "@/lib/sessions/manager"
import { removeConciliacion } from "@/lib/conciliacion/registry"

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { sessionId } = body as { sessionId?: string }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
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
