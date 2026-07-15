import { NextRequest, NextResponse } from "next/server"
import { createSession } from "@/lib/sessions/manager"
import { listConciliaciones } from "@/lib/conciliacion/registry"
import { requireOrgId } from "@/lib/auth/current-user"

export async function POST(req: NextRequest) {
  try {
    // createSession() (lib/sessions/manager) ya setea orgId internamente vía
    // requireOrgId() — acá solo lo necesitamos para el conteo de listConciliaciones.
    const orgId = await requireOrgId()

    let label: string | undefined
    try {
      const body = await req.json()
      label = body?.label
    } catch {
      // sin body, ok
    }
    if (!label) {
      const count = (await listConciliaciones(orgId)).length
      label = `Conciliación ${count + 1}`
    }
    const sessionId = await createSession(label)
    return NextResponse.json({ sessionId, label })
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
    }
    return NextResponse.json({ error: "Error creando sesión" }, { status: 500 })
  }
}
