import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { movimientosDiferidos } from "@/lib/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { requireOrgId } from "@/lib/auth/current-user"

// Estados que este PATCH puede setear (transición desde "pendiente" al recibir el extracto del período destino).
const ESTADOS_PATCH = ["conciliado", "descartado"] as const

// Lista diferidos pendientes de un banco+período (para mostrar al recibir el extracto del mes destino).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const bankId = searchParams.get("bankId")
    const periodo = searchParams.get("periodo")
    if (!bankId || !periodo) {
      return NextResponse.json({ error: "bankId y periodo requeridos" }, { status: 400 })
    }

    const orgId = await requireOrgId()

    const rows = await db.select().from(movimientosDiferidos)
      .where(and(
        eq(movimientosDiferidos.orgId, orgId),
        eq(movimientosDiferidos.bancoId, bankId),
        eq(movimientosDiferidos.periodoDestino, periodo),
        eq(movimientosDiferidos.estado, "pendiente"),
      ))
      .orderBy(asc(movimientosDiferidos.fecha))

    return NextResponse.json(rows)
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[GET /api/conciliacion/diferidos]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// Marca un diferido como conciliado (vinculado a un movimiento de la conciliación actual) o descartado.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const { diferidoId, estado, conciliadoEnMovimientoId } = (body ?? {}) as {
      diferidoId?: string
      estado?: string
      conciliadoEnMovimientoId?: string | null
    }

    if (!diferidoId) return NextResponse.json({ error: "diferidoId requerido" }, { status: 400 })
    if (!estado || !ESTADOS_PATCH.includes(estado as (typeof ESTADOS_PATCH)[number])) {
      return NextResponse.json({ error: "estado inválido" }, { status: 400 })
    }

    const orgId = await requireOrgId()

    const patch: { estado: string; conciliadoEnMovimientoId?: string | null } = { estado }
    if (conciliadoEnMovimientoId !== undefined) patch.conciliadoEnMovimientoId = conciliadoEnMovimientoId

    const [row] = await db.update(movimientosDiferidos)
      .set(patch)
      .where(and(eq(movimientosDiferidos.id, diferidoId), eq(movimientosDiferidos.orgId, orgId)))
      .returning()

    if (!row) return NextResponse.json({ error: "Diferido no encontrado" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[PATCH /api/conciliacion/diferidos]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
