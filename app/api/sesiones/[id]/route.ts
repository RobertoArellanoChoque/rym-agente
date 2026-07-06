import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sesiones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const [row] = await db.select().from(sesiones).where(eq(sesiones.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: "No encontrada" }, { status: 404 })
  return NextResponse.json(row)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const body = await req.json()
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (body.label !== undefined) patch.label = body.label
    if (body.estado !== undefined) patch.estado = body.estado
    if (body.datos !== undefined) patch.datos = typeof body.datos === "string" ? JSON.parse(body.datos) : body.datos
    await db.update(sesiones).set(patch).where(eq(sesiones.id, id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[PATCH /api/sesiones/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  await db.delete(sesiones).where(eq(sesiones.id, id))
  return NextResponse.json({ ok: true })
}
