import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { discrepancias as discrepanciasTable, conciliaciones } from "@/lib/db/schema"
import { CATEGORIAS_DESTINO } from "@/lib/extractos/impuestos"
import { and, eq } from "drizzle-orm"
import { requireOrgId } from "@/lib/auth/current-user"
import { audit } from "@/lib/audit"

// Recategorizar (bucketOverride) y/o marcar para revisar una discrepancia.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const { discrepanciaId, bucketOverride, revisar } = (body ?? {}) as {
      discrepanciaId?: number
      bucketOverride?: string | null
      revisar?: boolean
    }

    if (!discrepanciaId) {
      return NextResponse.json({ error: "discrepanciaId requerido" }, { status: 400 })
    }
    if (bucketOverride === undefined && revisar === undefined) {
      return NextResponse.json({ error: "Nada para actualizar (bucketOverride o revisar)" }, { status: 400 })
    }

    // El allowlist se valida solo client-side; reforzar acá contra strings arbitrarios.
    if (bucketOverride && !CATEGORIAS_DESTINO.includes(bucketOverride))
      return NextResponse.json({ error: "bucketOverride inválido" }, { status: 400 })

    const orgId = await requireOrgId()

    // discrepancias no tiene orgId propio (tabla hija) — confirmar pertenencia vía su
    // conciliación padre antes de aplicar el PATCH.
    const [owned] = await db.select({ id: discrepanciasTable.id })
      .from(discrepanciasTable)
      .innerJoin(conciliaciones, eq(discrepanciasTable.conciliacionId, conciliaciones.id))
      .where(and(eq(discrepanciasTable.id, discrepanciaId), eq(conciliaciones.orgId, orgId)))
      .limit(1)
    if (!owned) return NextResponse.json({ error: "Discrepancia no encontrada" }, { status: 404 })

    const patch: { bucketOverride?: string | null; revisar?: boolean } = {}
    if (bucketOverride !== undefined) patch.bucketOverride = bucketOverride || null
    if (revisar !== undefined) patch.revisar = revisar

    const [row] = await db.update(discrepanciasTable)
      .set(patch)
      .where(eq(discrepanciasTable.id, discrepanciaId))
      .returning()

    if (!row) return NextResponse.json({ error: "Discrepancia no encontrada" }, { status: 404 })

    await audit("editar_discrepancia", "discrepancia", String(discrepanciaId), { bucketOverride, revisar })

    return NextResponse.json({ ok: true, bucketOverride: row.bucketOverride, revisar: row.revisar ?? false })
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[PATCH /api/conciliacion/discrepancia]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
