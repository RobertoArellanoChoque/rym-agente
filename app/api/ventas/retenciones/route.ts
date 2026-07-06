import { NextRequest, NextResponse } from "next/server"
import { procesarComprobantePago } from "@/lib/ventas/extractor"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { db } from "@/lib/db"
import { sesiones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const sesionId = formData.get("sesionId") as string | null

  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
  if (!file.name.toLowerCase().endsWith(".pdf"))
    return NextResponse.json({ error: "Solo se aceptan archivos PDF" }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })

  const buffer = await file.arrayBuffer()

  try {
    const { result } = await procesarComprobantePago(buffer)

    if (sesionId) {
      const now = new Date().toISOString()
      await db.update(sesiones)
        .set({ datos: { pago: result }, estado: "completado", updatedAt: now })
        .where(eq(sesiones.id, sesionId))
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[ventas/retenciones] error:", err)
    const msg = err instanceof Error ? err.message : String(err)
    if (sesionId) {
      await db.update(sesiones)
        .set({ estado: "error", updatedAt: new Date().toISOString() })
        .where(eq(sesiones.id, sesionId))
    }
    if (msg.includes("MISTRAL_API_KEY_NOT_CONFIGURED"))
      return NextResponse.json({ error: "Servicio de OCR no disponible." }, { status: 503 })
    if (msg.includes("not configured"))
      return NextResponse.json({ error: "Servicio de IA no disponible." }, { status: 503 })
    return NextResponse.json({ error: "Error procesando el comprobante" }, { status: 500 })
  }
}
