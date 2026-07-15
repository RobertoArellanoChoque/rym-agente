import { NextRequest, NextResponse } from "next/server"
import { upsertConciliacion, getConciliacion } from "@/lib/conciliacion/registry"
import { requireOrgId } from "@/lib/auth/current-user"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const label = typeof body.label === "string" ? body.label.trim() : null

  if (!label) return NextResponse.json({ error: "label requerido" }, { status: 400 })
  try {
    let orgId: string
    try {
      orgId = await requireOrgId()
    } catch {
      return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
    }
    if (!(await getConciliacion(id, orgId))) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
    await upsertConciliacion(id, { label }, orgId)
    return NextResponse.json({ ok: true, label })
  } catch (e) {
    console.error("[PATCH /api/conciliacion/:id/label]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
