import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"
import { getConciliacion, upsertConciliacion } from "@/lib/conciliacion/registry"
import { siguientePeriodo, nombreMes } from "@/lib/conciliacion/periodo"
import { requireOrgId } from "@/lib/auth/current-user"
import crypto from "crypto"

// Crea (o abre) la conciliación del mes siguiente para el mismo banco.
// Carry-forward: saldoAnterior del nuevo mes = saldoFinal del mes aprobado.
export async function POST(req: NextRequest) {
  try {
    let orgId: string
    try {
      orgId = await requireOrgId()
    } catch {
      return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
    }

    const { fromSessionId } = await req.json()
    if (!fromSessionId) return NextResponse.json({ error: "fromSessionId requerido" }, { status: 400 })

    const prev = await getConciliacion(fromSessionId, orgId)
    if (!prev) return NextResponse.json({ error: "Sesión origen no encontrada" }, { status: 404 })
    if (!prev.periodo) return NextResponse.json({ error: "La conciliación origen no tiene período (sin fechas)" }, { status: 400 })

    const nextPeriodo = siguientePeriodo(prev.periodo)

    // Guard anti-duplicado: ¿ya existe una conciliación (banco, mes siguiente)? Filtro
    // adicional por orgId sobre el guard existente (bancoId ya no alcanza solo: dos orgs
    // pueden compartir bancoId+periodo).
    if (prev.bankId) {
      const [existing] = await db.select({ id: conciliaciones.id })
        .from(conciliaciones)
        .where(and(
          eq(conciliaciones.bancoId, prev.bankId),
          eq(conciliaciones.periodo, nextPeriodo),
          eq(conciliaciones.orgId, orgId),
          ne(conciliaciones.id, fromSessionId),
        ))
        .limit(1)
      if (existing) {
        return NextResponse.json({ ok: true, sessionId: existing.id, yaExistia: true, periodo: nextPeriodo })
      }
    }

    const sessionId = crypto.randomUUID()
    const label = prev.bankName ? `${prev.bankName} — ${nombreMes(nextPeriodo)}` : `Conciliación ${nombreMes(nextPeriodo)}`
    await upsertConciliacion(sessionId, {
      label,
      stage: "new",
      periodo: nextPeriodo,
      bankId: prev.bankId,
      bankName: prev.bankName,
      confidence: prev.confidence,
      saldoAnterior: prev.saldoFinal, // carry-forward: cierre del mes previo = apertura del nuevo
    }, orgId)

    return NextResponse.json({ ok: true, sessionId, yaExistia: false, periodo: nextPeriodo, label })
  } catch (e) {
    console.error("[POST /api/conciliacion/continuar]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
