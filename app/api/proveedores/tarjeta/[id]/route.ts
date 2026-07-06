import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { resumenTarjetas, lineasTarjeta } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const [resumen] = await db.select().from(resumenTarjetas).where(eq(resumenTarjetas.id, id)).limit(1)
  if (!resumen) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  const lineas = await db.select().from(lineasTarjeta).where(eq(lineasTarjeta.resumenId, id))
  return NextResponse.json({ ...resumen, lineas })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { label } = await req.json()
  if (!label) return NextResponse.json({ error: "label requerido" }, { status: 400 })
  await db.update(resumenTarjetas).set({ nombreTarjeta: label }).where(eq(resumenTarjetas.id, id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  await db.delete(resumenTarjetas).where(eq(resumenTarjetas.id, id))
  return NextResponse.json({ ok: true })
}
