import { NextRequest, NextResponse } from "next/server"
import { procesarExtractoTarjeta } from "@/lib/tarjetas/extractor"
import { matchTarjeta } from "@/lib/tarjetas/matcher"
import { toCentavos, MAX_UPLOAD_BYTES } from "@/lib/utils"
import { rateLimit, ipOf } from "@/lib/rate-limit"
import { requireOrgId } from "@/lib/auth/current-user"

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`upload:${ipOf(req)}`, 10, 60_000)))
    return NextResponse.json({ error: "Demasiadas solicitudes, esperá un momento" }, { status: 429 })
  try {
    const orgId = await requireOrgId()
    // Las tarjetas maestras viven en Supabase (sembrar con `npm run db:seed`).
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Solo se aceptan archivos PDF" }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })
    }

    const buffer = await file.arrayBuffer()

    let extraction
    try {
      extraction = await procesarExtractoTarjeta(buffer)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === "MISTRAL_API_KEY_NOT_CONFIGURED") {
        return NextResponse.json({ error: "Servicio de OCR no disponible.", ocrRequired: true }, { status: 503 })
      }
      if (msg.includes("AI model not configured")) {
        return NextResponse.json({ error: "Servicio de IA no disponible.", aiRequired: true }, { status: 503 })
      }
      throw e
    }

    const { markdown, result } = extraction

    // Match against catalog using both AI-extracted name and raw markdown
    const { tarjeta: tarjetaDetectada, confidence } = await matchTarjeta(
      `${result.nombreTarjeta} ${markdown}`,
      orgId
    )

    const lineasConCentavos = result.lineas.map((l) => ({
      cuenta: l.cuenta,
      descripcion: l.descripcion,
      monto: toCentavos(l.monto),
      periodo: l.periodo || result.periodo,
      tipoLinea: l.tipoLinea,
    }))

    const impuestos = lineasConCentavos.filter((l) => l.tipoLinea === "impuesto")
    const devoluciones = lineasConCentavos.filter((l) => l.tipoLinea === "devolucion")

    return NextResponse.json({
      tarjetaDetectada,
      confidence,
      nombreTarjeta: result.nombreTarjeta,
      periodo: result.periodo,
      impuestos,
      devoluciones,
      totalImpuestos: impuestos.reduce((s, l) => s + l.monto, 0),
      totalDevoluciones: devoluciones.reduce((s, l) => s + l.monto, 0),
      rawLineas: lineasConCentavos,
    })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[POST /api/proveedores/tarjeta/preview]", e)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
