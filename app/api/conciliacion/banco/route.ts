import { NextRequest, NextResponse } from "next/server"
import { sessionExists } from "@/lib/sessions/manager"
import { extraerBanco, persistBanco, IngestBancoError } from "@/lib/conciliacion/ingest-banco"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { rateLimit, ipOf } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`upload:${ipOf(req)}`, 10, 60_000)))
    return NextResponse.json({ error: "Demasiadas solicitudes, esperá un momento" }, { status: 429 })
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const sessionId = formData.get("sessionId") as string | null

  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })
  if (!(await sessionExists(sessionId))) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })

  const buffer = await file.arrayBuffer()

  let ext
  try {
    ext = await extraerBanco(buffer, file.name)
  } catch (err) {
    if (err instanceof IngestBancoError) {
      switch (err.code) {
        case "UNSUPPORTED_FORMAT": return NextResponse.json({ error: "Formato no soportado. Subí PDF o Excel." }, { status: 400 })
        case "OCR_UNAVAILABLE": return NextResponse.json({ error: "Servicio de OCR no disponible.", ocrRequired: true }, { status: 503 })
        case "OCR_FAILED": return NextResponse.json({ error: "Error procesando el PDF con OCR" }, { status: 400 })
        case "AI_UNAVAILABLE": return NextResponse.json({ error: "Servicio de IA no disponible.", aiRequired: true }, { status: 503 })
        case "AI_FAILED": return NextResponse.json({ error: "Error extrayendo movimientos con IA" }, { status: 500 })
        case "READ_FAILED": return NextResponse.json({ error: "Error leyendo el archivo" }, { status: 400 })
      }
    }
    console.error("[banco/route] extraerBanco error:", err)
    return NextResponse.json({ error: "Error procesando el extracto" }, { status: 500 })
  }

  try {
    await persistBanco(sessionId, ext)
  } catch (err) {
    if (err instanceof Error && err.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    if (err instanceof Error && err.message === "La sesión pertenece a otra organización") {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    console.error("[banco/route] persistBanco error:", err)
    return NextResponse.json({ error: "Error guardando el extracto" }, { status: 500 })
  }

  return NextResponse.json({
    sessionId,
    bank: ext.bankResult,
    movimientos: ext.movimientos,
    total: ext.movimientos.length,
    saldoAnterior: ext.saldoAnterior,
    saldoFinal: ext.saldoFinal,
    cadenaSaldos: ext.cadena,
    ...(ext.autoLabel && { label: ext.autoLabel }),
  })
}
