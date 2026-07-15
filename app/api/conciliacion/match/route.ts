import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { matches as matchesTable, conciliaciones } from "@/lib/db/schema"
import { requireOrgId } from "@/lib/auth/current-user"
import { audit } from "@/lib/audit"
import { and, eq } from "drizzle-orm"

export async function PATCH(req: NextRequest) {
  try {
    let orgId: string
    try {
      orgId = await requireOrgId()
    } catch {
      return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { matchId, action } = body as { matchId?: number; action?: "confirm" | "reject" }

    if (!matchId || !action) {
      return NextResponse.json({ error: "matchId y action requeridos" }, { status: 400 })
    }
    if (!["confirm", "reject"].includes(action)) {
      return NextResponse.json({ error: "action debe ser 'confirm' o 'reject'" }, { status: 400 })
    }

    // matches no tiene orgId propio (tabla hija) — se scopea por join a su
    // conciliación padre. Sin este join, matchId (serial autoincremental) es
    // adivinable/enumerable y cualquier org podría confirmar/rechazar matches ajenos.
    const [match] = await db.select({ id: matchesTable.id })
      .from(matchesTable)
      .innerJoin(conciliaciones, eq(matchesTable.conciliacionId, conciliaciones.id))
      .where(and(eq(matchesTable.id, matchId), eq(conciliaciones.orgId, orgId)))
      .limit(1)
    if (!match) return NextResponse.json({ error: "Match no encontrado" }, { status: 404 })

    const nuevoTipo = action === "confirm" ? "confirmed" : "rejected"
    await db.update(matchesTable).set({ tipo: nuevoTipo, origen: "manual" }).where(eq(matchesTable.id, matchId))

    await audit("editar_match", "match", String(matchId), { tipo: nuevoTipo })

    return NextResponse.json({ ok: true, tipo: nuevoTipo })
  } catch (e) {
    console.error("[PATCH /api/conciliacion/match]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
