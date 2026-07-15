import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { resumenTarjetas } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { requireOrgId } from "@/lib/auth/current-user"
import { audit } from "@/lib/audit"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const orgId = await requireOrgId()
    const { id } = await params
    const resumen = await db.query.resumenTarjetas.findFirst({
      where: and(eq(resumenTarjetas.id, id), eq(resumenTarjetas.orgId, orgId)),
      with: { lineas: true },
    })
    if (!resumen) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
    return NextResponse.json(resumen)
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[GET /api/proveedores/tarjeta/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const orgId = await requireOrgId()
    const { id } = await params
    const { label } = await req.json().catch(() => ({}))
    if (!label) return NextResponse.json({ error: "label requerido" }, { status: 400 })
    const updated = await db.update(resumenTarjetas).set({ nombreTarjeta: label })
      .where(and(eq(resumenTarjetas.id, id), eq(resumenTarjetas.orgId, orgId)))
      .returning({ id: resumenTarjetas.id })
    if (updated.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[PATCH /api/proveedores/tarjeta/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const orgId = await requireOrgId()
    const { id } = await params
    const deleted = await db.delete(resumenTarjetas)
      .where(and(eq(resumenTarjetas.id, id), eq(resumenTarjetas.orgId, orgId)))
      .returning({ id: resumenTarjetas.id })
    if (deleted.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
    await audit("borrar_resumen_tarjeta", "resumen_tarjeta", id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[DELETE /api/proveedores/tarjeta/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
