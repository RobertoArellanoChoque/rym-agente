import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { discrepancias, conciliaciones, movimientos, movimientosDiferidos } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { siguientePeriodo } from "@/lib/conciliacion/periodo"
import { currentUserId, requireOrgId } from "@/lib/auth/current-user"
import crypto from "crypto"

// Difiere una discrepancia "en extracto, no en mayor" al período siguiente:
// guarda snapshot en movimientos_diferidos y marca el movimiento origen con
// diferido_a para excluirlo del matching en re-runs de esta misma conciliación.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const { discrepanciaId } = (body ?? {}) as { discrepanciaId?: number }

    if (!discrepanciaId) {
      return NextResponse.json({ error: "discrepanciaId requerido" }, { status: 400 })
    }

    const orgId = await requireOrgId()

    // Cargar discrepancia + conciliación padre en un solo join, filtrando por orgId acá:
    // evita materializar filas de otra org antes de confirmar pertenencia.
    const [row] = await db.select({ disc: discrepancias, conc: conciliaciones })
      .from(discrepancias)
      .innerJoin(conciliaciones, eq(discrepancias.conciliacionId, conciliaciones.id))
      .where(and(eq(discrepancias.id, discrepanciaId), eq(conciliaciones.orgId, orgId)))
      .limit(1)
    if (!row) return NextResponse.json({ error: "Discrepancia no encontrada" }, { status: 404 })
    const { disc, conc } = row
    if (!disc.movimientoId) {
      return NextResponse.json({ error: "Solo se pueden diferir discrepancias con movimiento de banco asociado" }, { status: 400 })
    }
    if (!conc.periodo) return NextResponse.json({ error: "La conciliación no tiene período definido" }, { status: 400 })
    if (!conc.bancoId) return NextResponse.json({ error: "La conciliación no tiene banco asociado" }, { status: 400 })

    const [mov] = await db.select().from(movimientos).where(eq(movimientos.id, disc.movimientoId)).limit(1)
    if (!mov) return NextResponse.json({ error: "Movimiento origen no encontrado" }, { status: 404 })
    if (mov.diferidoA) {
      return NextResponse.json({ error: "Este movimiento ya fue diferido" }, { status: 409 })
    }

    const periodoDestino = siguientePeriodo(conc.periodo)
    const userId = await currentUserId()

    await db.transaction(async (tx) => {
      await tx.insert(movimientosDiferidos).values({
        id: crypto.randomUUID(),
        bancoId: conc.bancoId!,
        periodoDestino,
        origenConciliacionId: conc.id,
        origenMovimientoId: mov.id,
        origenDiscrepanciaId: disc.id,
        fecha: mov.fecha,
        descripcion: mov.descripcion,
        referencia: mov.referencia,
        monto: mov.monto,
        categoria: mov.categoria,
        estado: "pendiente",
        createdBy: userId,
        orgId,
      })
      await tx.update(movimientos).set({ diferidoA: periodoDestino }).where(eq(movimientos.id, mov.id))
    })

    return NextResponse.json({ ok: true, periodoDestino })
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[POST /api/conciliacion/diferir]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
