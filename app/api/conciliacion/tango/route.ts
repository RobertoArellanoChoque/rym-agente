import { NextRequest, NextResponse } from "next/server"
import { sessionExists } from "@/lib/sessions/manager"
import { extraerTango, persistTango, IngestTangoError } from "@/lib/conciliacion/ingest-tango"
import { rateLimit, ipOf } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`upload:${ipOf(req)}`, 10, 60_000)))
    return NextResponse.json({ error: "Demasiadas solicitudes, esperá un momento" }, { status: 429 })
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const sessionId = formData.get("sessionId") as string | null

  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
  if (!(await sessionExists(sessionId))) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })

  const buffer = await file.arrayBuffer()

  let mayor
  try {
    mayor = await extraerTango(buffer, file.name)
  } catch (err) {
    if (err instanceof IngestTangoError) {
      switch (err.code) {
        case "UNSUPPORTED_FORMAT": return NextResponse.json({ error: "Formato no soportado. Subí un archivo de Tango (.xlsx, .xls o .csv)." }, { status: 400 })
        case "EMPTY": return NextResponse.json({ error: "No se encontraron asientos en el archivo. Verificá el formato." }, { status: 400 })
        case "PARSE_FAILED": return NextResponse.json({ error: "Error procesando el archivo de Tango" }, { status: 500 })
      }
    }
    console.error("[tango/route] extraerTango error:", err)
    return NextResponse.json({ error: "Error procesando el archivo de Tango" }, { status: 500 })
  }

  try {
    await persistTango(sessionId, mayor)
  } catch (err) {
    console.error("[tango/route] persistTango error:", err)
    return NextResponse.json({ error: "Error guardando el mayor de Tango" }, { status: 500 })
  }

  return NextResponse.json({ sessionId, asientos: mayor.asientos, total: mayor.asientos.length })
}
