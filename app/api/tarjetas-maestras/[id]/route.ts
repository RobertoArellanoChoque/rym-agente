import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { tarjetasMaestras } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (parsed.data.nombre !== undefined) patch.nombre = parsed.data.nombre
  if (parsed.data.banco !== undefined) patch.banco = parsed.data.banco
  if (parsed.data.tipo !== undefined) patch.tipo = parsed.data.tipo
  if (parsed.data.activa !== undefined) patch.activa = parsed.data.activa ? 1 : 0
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })

  try {
    const updated = await db.update(tarjetasMaestras).set(patch).where(eq(tarjetasMaestras.id, id)).returning()
    if (updated.length === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 })
    return NextResponse.json(updated[0])
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Ya existe una tarjeta con ese nombre" }, { status: 409 })
    }
    throw e
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const deleted = await db.delete(tarjetasMaestras).where(eq(tarjetasMaestras.id, id)).returning({ id: tarjetasMaestras.id })
  if (deleted.length === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
