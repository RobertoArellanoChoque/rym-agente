import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { tarjetasMaestras } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { currentUserId, requireOrgId } from "@/lib/auth/current-user"
import { audit } from "@/lib/audit"

type Params = { params: Promise<{ id: string }> }

// drizzle envuelve el error de postgres; el code de PG queda en .cause
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code
  return code === "23505"
}

const PatchSchema = z.object({
  nombre: z.string().min(1).optional(),
  banco: z.string().min(1).optional(),
  tipo: z.enum(["VISA", "MASTERCARD", "AMEX"]).optional(),
  activa: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const orgId = await requireOrgId()
    const { id } = await params
    const body = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (parsed.data.nombre !== undefined) patch.nombre = parsed.data.nombre
    if (parsed.data.banco !== undefined) patch.banco = parsed.data.banco
    if (parsed.data.tipo !== undefined) patch.tipo = parsed.data.tipo
    if (parsed.data.activa !== undefined) patch.activa = parsed.data.activa
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
    patch.updatedBy = await currentUserId()

    try {
      const updated = await db.update(tarjetasMaestras).set(patch)
        .where(and(eq(tarjetasMaestras.id, id), eq(tarjetasMaestras.orgId, orgId)))
        .returning()
      if (updated.length === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 })
      return NextResponse.json(updated[0])
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        return NextResponse.json({ error: "Ya existe una tarjeta con ese nombre" }, { status: 409 })
      }
      throw e
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    throw e
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const orgId = await requireOrgId()
    const { id } = await params
    const deleted = await db.delete(tarjetasMaestras)
      .where(and(eq(tarjetasMaestras.id, id), eq(tarjetasMaestras.orgId, orgId)))
      .returning({ id: tarjetasMaestras.id })
    if (deleted.length === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 })
    await audit("borrar_tarjeta_maestra", "tarjeta_maestra", id)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    throw e
  }
}
