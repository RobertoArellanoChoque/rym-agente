import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { matches as matchesTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { matchId, action } = body as { matchId?: number; action?: "confirm" | "reject" }

    if (!matchId || !action) {
      return NextResponse.json({ error: "matchId y action requeridos" }, { status: 400 })
    }
    if (!["confirm", "reject"].includes(action)) {
      return NextResponse.json({ error: "action debe ser 'confirm' o 'reject'" }, { status: 400 })
    }

    const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).limit(1)
    if (!match) return NextResponse.json({ error: "Match no encontrado" }, { status: 404 })

    const nuevoTipo = action === "confirm" ? "confirmed" : "rejected"
    await db.update(matchesTable).set({ tipo: nuevoTipo }).where(eq(matchesTable.id, matchId))

    return NextResponse.json({ ok: true, tipo: nuevoTipo })
  } catch (e) {
    console.error("[PATCH /api/conciliacion/match]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
