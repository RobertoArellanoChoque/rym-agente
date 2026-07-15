import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sesiones } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { currentUserId, requireOrgId } from "@/lib/auth/current-user"
import { audit } from "@/lib/audit"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const orgId = await requireOrgId()
    const [row] = await db.select().from(sesiones).where(and(eq(sesiones.id, id), eq(sesiones.orgId, orgId))).limit(1)
    if (!row) return NextResponse.json({ error: "No encontrada" }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    console.error("[GET /api/sesiones/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const orgId = await requireOrgId()
    const body = await req.json()
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: await currentUserId() }
    if (body.label !== undefined) patch.label = body.label
    if (body.estado !== undefined) {
      if (!["activo", "completado", "error"].includes(body.estado)) {
        return NextResponse.json({ error: "estado inválido (activo|completado|error)" }, { status: 400 })
      }
      patch.estado = body.estado
    }
    if (body.datos !== undefined) {
      const datos = typeof body.datos === "string" ? JSON.parse(body.datos) : body.datos
      // Guard de forma: solo objetos planos (el shape es específico por módulo).
      // ponytail: guard de forma, no schema completo.
      if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
        return NextResponse.json({ error: "datos debe ser un objeto" }, { status: 400 })
      }
      patch.datos = datos
    }
    await db.update(sesiones).set(patch).where(and(eq(sesiones.id, id), eq(sesiones.orgId, orgId)))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[PATCH /api/sesiones/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const orgId = await requireOrgId()
    await db.delete(sesiones).where(and(eq(sesiones.id, id), eq(sesiones.orgId, orgId)))
    await audit("borrar_sesion", "sesion", id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[DELETE /api/sesiones/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
