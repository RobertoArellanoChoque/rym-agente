import { NextRequest, NextResponse } from "next/server"
import { sessionExists } from "@/lib/sessions/manager"
import { extraerBanco, persistBanco, IngestBancoError } from "@/lib/conciliacion/ingest-banco"
import { extraerTango, persistTango, IngestTangoError } from "@/lib/conciliacion/ingest-tango"
import { clasificar } from "@/lib/conciliacion/clasificar"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { rateLimit, ipOf } from "@/lib/rate-limit"
import { requireOrgId } from "@/lib/auth/current-user"

export const maxDuration = 300

// Sube extracto banco + mayor Tango juntos a la MISMA conciliación activa (a diferencia
// de ingest-batch, que crea sesiones propias). Aterriza en stage "tango-done" para revisar
// antes de comparar — no auto-concilia.
export async function POST(req: NextRequest) {
  if (!(await rateLimit(`upload:${ipOf(req)}`, 30, 60_000)))
    return NextResponse.json({ error: "Demasiadas solicitudes, esperá un momento" }, { status: 429 })

  // Chequeo temprano: evita gastar OCR/LLM en clasificar+extraer si no hay org activa.
  try {
    await requireOrgId()
  } catch {
    return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
  }

  const formData = await req.formData()
  const files = formData.getAll("files").filter((f): f is File => f instanceof File)
  const sessionId = formData.get("sessionId") as string | null

  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
  if (files.length !== 2) return NextResponse.json({ error: "Se necesitan exactamente 2 archivos" }, { status: 400 })
  if (files.some(f => f.size > MAX_UPLOAD_BYTES))
    return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })
  if (!(await sessionExists(sessionId))) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })

  const buffers = await Promise.all(files.map(f => f.arrayBuffer()))
  const kinds = await Promise.all(buffers.map((buf, i) => clasificar(buf, files[i].name)))

  const bancoIdx = kinds.indexOf("banco")
  const tangoIdx = kinds.indexOf("tango")
  const ambiguo = bancoIdx === -1 || tangoIdx === -1 || bancoIdx === tangoIdx
    || kinds.filter(k => k === "banco").length !== 1 || kinds.filter(k => k === "tango").length !== 1
  if (ambiguo) {
    return NextResponse.json(
      { error: "No pudimos identificar cuál es el extracto bancario y cuál el mayor de Tango. Subí un archivo de cada tipo." },
      { status: 400 },
    )
  }

  let ext, mayor
  try {
    ;[ext, mayor] = await Promise.all([
      extraerBanco(buffers[bancoIdx], files[bancoIdx].name),
      extraerTango(buffers[tangoIdx], files[tangoIdx].name),
    ])
  } catch (err) {
    if (err instanceof IngestBancoError) {
      switch (err.code) {
        case "UNSUPPORTED_FORMAT": return NextResponse.json({ error: "Formato de extracto no soportado. Subí PDF o Excel." }, { status: 400 })
        case "OCR_UNAVAILABLE": return NextResponse.json({ error: "Servicio de OCR no disponible.", ocrRequired: true }, { status: 503 })
        case "OCR_FAILED": return NextResponse.json({ error: "Error procesando el PDF con OCR" }, { status: 400 })
        case "AI_UNAVAILABLE": return NextResponse.json({ error: "Servicio de IA no disponible.", aiRequired: true }, { status: 503 })
        case "AI_FAILED": return NextResponse.json({ error: "Error extrayendo movimientos con IA" }, { status: 500 })
        case "READ_FAILED": return NextResponse.json({ error: "Error leyendo el extracto" }, { status: 400 })
      }
    }
    if (err instanceof IngestTangoError) {
      switch (err.code) {
        case "UNSUPPORTED_FORMAT": return NextResponse.json({ error: "Formato de Tango no soportado. Subí .xlsx, .xls o .csv." }, { status: 400 })
        case "EMPTY": return NextResponse.json({ error: "No se encontraron asientos en el archivo de Tango." }, { status: 400 })
        case "PARSE_FAILED": return NextResponse.json({ error: "Error procesando el archivo de Tango" }, { status: 500 })
      }
    }
    console.error("[banco-y-tango/route] extraer error:", err)
    return NextResponse.json({ error: "Error procesando los archivos" }, { status: 500 })
  }

  try {
    await persistBanco(sessionId, ext)
    await persistTango(sessionId, mayor)
  } catch (err) {
    if (err instanceof Error && err.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    if (err instanceof Error && err.message === "La sesión pertenece a otra organización") {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    console.error("[banco-y-tango/route] persist error:", err)
    return NextResponse.json({ error: "Error guardando los archivos" }, { status: 500 })
  }

  return NextResponse.json({
    sessionId,
    bank: ext.bankResult,
    movimientos: ext.movimientos,
    saldoAnterior: ext.saldoAnterior,
    saldoFinal: ext.saldoFinal,
    asientos: mayor.asientos,
    total: ext.movimientos.length + mayor.asientos.length,
    ...(ext.autoLabel && { label: ext.autoLabel }),
  })
}
