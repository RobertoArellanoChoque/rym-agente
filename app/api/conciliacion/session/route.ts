import { NextRequest, NextResponse } from "next/server"
import { createSession } from "@/lib/sessions/manager"
import { listConciliaciones } from "@/lib/conciliacion/registry"

export async function POST(req: NextRequest) {
  try {
    let label: string | undefined
    try {
      const body = await req.json()
      label = body?.label
    } catch {
      // sin body, ok
    }
    if (!label) {
      const count = (await listConciliaciones()).length
      label = `Conciliación ${count + 1}`
    }
    const sessionId = await createSession(label)
    return NextResponse.json({ sessionId, label })
  } catch {
    return NextResponse.json({ error: "Error creando sesión" }, { status: 500 })
  }
}
