import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { sesiones } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { currentUserId } from "@/lib/auth/current-user"

export async function GET(req: NextRequest) {
  const modulo = req.nextUrl.searchParams.get("modulo")
  try {
    const rows = modulo
      ? await db.select().from(sesiones).where(eq(sesiones.modulo, modulo as "ventas" | "contabilidad")).orderBy(desc(sesiones.updatedAt))
      : await db.select().from(sesiones).orderBy(desc(sesiones.updatedAt))
    return NextResponse.json(rows)
  } catch (e) {
    console.error("[GET /api/sesiones]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { modulo, label } = await req.json()
    if (modulo !== "ventas" && modulo !== "contabilidad")
      return NextResponse.json({ error: "modulo inválido (ventas|contabilidad)" }, { status: 400 })
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const defaultLabel = label ?? `${modulo === "ventas" ? "Comprobante" : "Comparación"} ${now.slice(0, 10)}`
    const userId = await currentUserId()
    await db.insert(sesiones).values({ id, modulo, label: defaultLabel, estado: "activo", datos: {}, createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId })
    return NextResponse.json({ id, label: defaultLabel })
  } catch (e) {
    console.error("[POST /api/sesiones]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
