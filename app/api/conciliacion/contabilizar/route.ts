import { NextRequest, NextResponse } from "next/server"
import { contabilizarPendientes } from "@/lib/conciliacion/contabilizar"

// Auth-gated por proxy.ts (cookie de sesión humana). Ver /cso F1: la
// contabilización solo se dispara por click humano, nunca por el agente LLM.
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
    const result = await contabilizarPendientes(sessionId)
    if ("error" in result) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[POST /api/conciliacion/contabilizar]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
