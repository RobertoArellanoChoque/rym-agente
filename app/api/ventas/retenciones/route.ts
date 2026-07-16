import { NextRequest, NextResponse } from "next/server"
import { procesarComprobantePago } from "@/lib/ventas/extractor"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { db } from "@/lib/db"
import { sesiones } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { currentUserId, requireOrgId } from "@/lib/auth/current-user"
import { rateLimit, ipOf } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`upload:${ipOf(req)}`, 30, 60_000)))
    return NextResponse.json({ error: "Demasiadas solicitudes, esperá un momento" }, { status: 429 })

  let orgId: string
  try {
    orgId = await requireOrgId()
  } catch {
    return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const sesionId = formData.get("sesionId") as string | null

  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
  const ext = file.name.toLowerCase().split(".").pop()
  if (!["pdf", "xlsx", "xls", "csv"].includes(ext ?? ""))
    return NextResponse.json({ error: "Formato no soportado. Usá PDF, Excel o CSV." }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })

  const buffer = await file.arrayBuffer()
  const userId = await currentUserId()

  try {
    const { result } = await procesarComprobantePago(buffer, file.name)

    if (sesionId) {
      const now = new Date().toISOString()
      await db.update(sesiones)
        .set({ datos: { pago: result }, estado: "completado", updatedAt: now, updatedBy: userId })
        .where(and(eq(sesiones.id, sesionId), eq(sesiones.orgId, orgId)))
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[ventas/retenciones] error:", err)
    const msg = err instanceof Error ? err.message : String(err)
    if (sesionId) {
      await db.update(sesiones)
        .set({ estado: "error", updatedAt: new Date().toISOString(), updatedBy: userId })
        .where(and(eq(sesiones.id, sesionId), eq(sesiones.orgId, orgId)))
    }
    if (msg.includes("MISTRAL_API_KEY_NOT_CONFIGURED"))
      return NextResponse.json({ error: "Servicio de OCR no disponible." }, { status: 503 })
    if (msg.includes("not configured"))
      return NextResponse.json({ error: "Servicio de IA no disponible." }, { status: 503 })
    return NextResponse.json({ error: "Error procesando el comprobante" }, { status: 500 })
  }
}
