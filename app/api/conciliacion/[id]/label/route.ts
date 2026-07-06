import { NextRequest, NextResponse } from "next/server"
import { upsertConciliacion, getConciliacion } from "@/lib/conciliacion/registry"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const label = typeof body.label === "string" ? body.label.trim() : null

  if (!label) return NextResponse.json({ error: "label requerido" }, { status: 400 })
  if (!(await getConciliacion(id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  await upsertConciliacion(id, { label })
  return NextResponse.json({ ok: true, label })
}
