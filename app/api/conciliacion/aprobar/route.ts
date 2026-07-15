import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { matches as matchesTable, conciliaciones } from "@/lib/db/schema"
import { requireOrgId } from "@/lib/auth/current-user"
import { getConciliacion } from "@/lib/conciliacion/registry"
import { approveConciliacion } from "@/lib/conciliacion/approve"
import { and, eq, inArray } from "drizzle-orm"

export async function POST(req: NextRequest) {
  try {
    let orgId: string
    try {
      orgId = await requireOrgId()
    } catch {
      return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { sessionId, matchIdsConfirmados, aceptarDiferencia } = body as {
      sessionId?: string
      matchIdsConfirmados?: number[]
      aceptarDiferencia?: boolean
    }

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
    }

    // Ownership: la sesión debe existir y pertenecer a la org.
    const session = await getConciliacion(sessionId, orgId)
    if (!session) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })

    // Matches "en juego" = confirmed|probable de esta sesión. Scoping por join a
    // conciliaciones.orgId (mismo patrón que match/route.ts): las filas de matches
    // no tienen orgId propio y su id serial es enumerable.
    const enJuego = await db.select({ id: matchesTable.id })
      .from(matchesTable)
      .innerJoin(conciliaciones, eq(matchesTable.conciliacionId, conciliaciones.id))
      .where(and(
        eq(matchesTable.conciliacionId, sessionId),
        eq(conciliaciones.orgId, orgId),
        inArray(matchesTable.tipo, ["confirmed", "probable"]),
      ))
    const enJuegoIds = new Set(enJuego.map(m => m.id))

    // No confiar en el input crudo: intersectar con lo que realmente está en juego.
    const pedidos = new Set(matchIdsConfirmados ?? [])
    const confirmar = [...enJuegoIds].filter(id => pedidos.has(id))
    const rechazar = [...enJuegoIds].filter(id => !pedidos.has(id))

    // Aprobar PRIMERO: valida stage="done" + diferencia residual. Si rebota, NO tocamos
    // los matches — evita reescribir su tipo en una operación que después falla.
    // approveConciliacion ya audita "aprobar_conciliacion" internamente (no duplicar acá).
    const result = await approveConciliacion(sessionId, aceptarDiferencia)
    if ("error" in result) return NextResponse.json(result, { status: 400 })

    // Persistir la selección (confirmed/rejected + origen='manual' como señal para el
    // matching inteligente). Fuera de transacción con el approve a propósito: la selección
    // de tipo de match no afecta el cómputo de `diferencia` (ya hecho en `comparar`).
    await db.transaction(async (tx) => {
      if (confirmar.length)
        await tx.update(matchesTable).set({ tipo: "confirmed", origen: "manual" }).where(inArray(matchesTable.id, confirmar))
      if (rechazar.length)
        await tx.update(matchesTable).set({ tipo: "rejected", origen: "manual" }).where(inArray(matchesTable.id, rechazar))
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error("[POST /api/conciliacion/aprobar]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
