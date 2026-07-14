import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { resumenTarjetas } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const resumen = await db.query.resumenTarjetas.findFirst({
      where: eq(resumenTarjetas.id, id),
      with: { lineas: true },
    })
    if (!resumen) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
    return NextResponse.json(resumen)
  } catch (e) {
    console.error("[GET /api/proveedores/tarjeta/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { label } = await req.json().catch(() => ({}))
    if (!label) return NextResponse.json({ error: "label requerido" }, { status: 400 })
    await db.update(resumenTarjetas).set({ nombreTarjeta: label }).where(eq(resumenTarjetas.id, id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[PATCH /api/proveedores/tarjeta/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await db.delete(resumenTarjetas).where(eq(resumenTarjetas.id, id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[DELETE /api/proveedores/tarjeta/:id]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
