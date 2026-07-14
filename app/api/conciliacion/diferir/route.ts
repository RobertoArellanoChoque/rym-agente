import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { discrepancias, conciliaciones, movimientos, movimientosDiferidos } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { siguientePeriodo } from "@/lib/conciliacion/periodo"
import { currentUserId } from "@/lib/auth/current-user"
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

    const [disc] = await db.select().from(discrepancias).where(eq(discrepancias.id, discrepanciaId)).limit(1)
    if (!disc) return NextResponse.json({ error: "Discrepancia no encontrada" }, { status: 404 })
    if (!disc.movimientoId) {
      return NextResponse.json({ error: "Solo se pueden diferir discrepancias con movimiento de banco asociado" }, { status: 400 })
    }

    const [conc] = await db.select().from(conciliaciones).where(eq(conciliaciones.id, disc.conciliacionId)).limit(1)
    if (!conc) return NextResponse.json({ error: "Conciliación no encontrada" }, { status: 404 })
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
      })
      await tx.update(movimientos).set({ diferidoA: periodoDestino }).where(eq(movimientos.id, mov.id))
    })

    return NextResponse.json({ ok: true, periodoDestino })
  } catch (e) {
    console.error("[POST /api/conciliacion/diferir]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
