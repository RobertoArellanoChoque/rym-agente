import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { tarjetasMaestras } from "@/lib/db/schema"
import { asc } from "drizzle-orm"

// drizzle envuelve el error de postgres; el code de PG queda en .cause
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code
  return code === "23505"
}

const CreateSchema = z.object({
  nombre: z.string().min(1),
  banco: z.string().min(1),
  tipo: z.enum(["VISA", "MASTERCARD", "AMEX"]),
  activa: z.boolean().optional(),
})

export async function GET() {
  const rows = await db.select().from(tarjetasMaestras).orderBy(asc(tarjetasMaestras.nombre))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos (nombre, banco, tipo: VISA|MASTERCARD|AMEX)" }, { status: 400 })
  }
  const { nombre, banco, tipo, activa } = parsed.data
  const row = { id: crypto.randomUUID(), nombre, banco, tipo, activa: activa === false ? 0 : 1 }
  try {
    await db.insert(tarjetasMaestras).values(row)
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: `Ya existe una tarjeta con nombre "${nombre}"` }, { status: 409 })
    }
    throw e
  }
  return NextResponse.json(row, { status: 201 })
}
