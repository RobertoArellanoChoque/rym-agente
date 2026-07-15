import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { conciliaciones, resumenTarjetas, sesiones } from "@/lib/db/schema"
import { and, desc, eq, ne } from "drizzle-orm"
import { approveConciliacion } from "@/lib/conciliacion/approve"
import { requireOrgId } from "@/lib/auth/current-user"
import { getAlertas } from "@/lib/alertas"

export async function GET() {
  try {
    const orgId = await requireOrgId()
    const [concs, tarjetas, ventasSesiones, contabilidadSesiones, alertas] = await Promise.all([
      db.select({
        id: conciliaciones.id,
        label: conciliaciones.label,
        stage: conciliaciones.stage,
        bancoNombre: conciliaciones.bancoNombre,
        diferencia: conciliaciones.diferencia,
        movimientosCount: conciliaciones.movimientosCount,
        updatedAt: conciliaciones.updatedAt,
      }).from(conciliaciones).where(and(eq(conciliaciones.orgId, orgId), ne(conciliaciones.stage, "aprobada"))).orderBy(desc(conciliaciones.updatedAt)).limit(20),

      db.select({
        id: resumenTarjetas.id,
        nombreTarjeta: resumenTarjetas.nombreTarjeta,
        periodo: resumenTarjetas.periodo,
        totalMonto: resumenTarjetas.totalMonto,
        creadoEn: resumenTarjetas.creadoEn,
      }).from(resumenTarjetas).where(eq(resumenTarjetas.orgId, orgId)).orderBy(desc(resumenTarjetas.creadoEn)).limit(20),

      db.select({
        id: sesiones.id,
        label: sesiones.label,
        estado: sesiones.estado,
        updatedAt: sesiones.updatedAt,
      }).from(sesiones).where(and(eq(sesiones.orgId, orgId), eq(sesiones.modulo, "ventas"))).orderBy(desc(sesiones.updatedAt)).limit(20),

      db.select({
        id: sesiones.id,
        label: sesiones.label,
        estado: sesiones.estado,
        updatedAt: sesiones.updatedAt,
      }).from(sesiones).where(and(eq(sesiones.orgId, orgId), eq(sesiones.modulo, "contabilidad"))).orderBy(desc(sesiones.updatedAt)).limit(20),

      getAlertas(orgId),
    ])

    return NextResponse.json({ conciliaciones: concs, tarjetas, ventasSesiones, contabilidadSesiones, alertas })
  } catch (e) {
    console.error("[GET /api/tasks]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, aceptarDiferencia = false } = await req.json()
    if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
    const result = await approveConciliacion(sessionId, aceptarDiferencia)
    if ("error" in result) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (e) {
    console.error("[POST /api/tasks]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
