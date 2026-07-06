import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { resumenTarjetas, lineasTarjeta } from "@/lib/db/schema"
import { procesarExtractoTarjeta } from "@/lib/tarjetas/extractor"
import { desc } from "drizzle-orm"
import { toCentavos, MAX_UPLOAD_BYTES } from "@/lib/utils"

interface RawLinea {
  cuenta: string
  descripcion: string
  monto: number // already centavos
  periodo: string
  tipoLinea: "cargo" | "impuesto" | "devolucion"
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? ""

    // Path A: pre-extracted JSON from preview (no re-run OCR)
    if (contentType.includes("application/json")) {
      const body = await req.json() as {
        nombreTarjeta: string
        periodo: string
        tarjetaMaestraId?: string
        rawLineas: RawLinea[]
      }

      if (!body.rawLineas?.length) {
        return NextResponse.json({ error: "Sin líneas para importar" }, { status: 400 })
      }

      const now = new Date().toISOString()
      const resumenId = crypto.randomUUID()
      const totalMonto = body.rawLineas.reduce((s, l) => s + l.monto, 0)

      await db.insert(resumenTarjetas).values({
        id: resumenId,
        nombreTarjeta: body.nombreTarjeta,
        periodo: body.periodo,
        totalMonto,
        tarjetaMaestraId: body.tarjetaMaestraId ?? null,
        creadoEn: now,
      })

      await db.insert(lineasTarjeta).values(body.rawLineas.map(l => ({
        id: crypto.randomUUID(),
        resumenId,
        cuenta: l.cuenta,
        descripcion: l.descripcion,
        monto: l.monto,
        periodo: l.periodo,
        estado: l.monto > 0 ? "OK" : "",
        tipoLinea: l.tipoLinea,
      })))

      return NextResponse.json({ id: resumenId, nombreTarjeta: body.nombreTarjeta, periodo: body.periodo, totalMonto })
    }

    // Path B: raw PDF upload (direct import without preview)
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

    const { result } = extraction
    const now = new Date().toISOString()
    const resumenId = crypto.randomUUID()
    const totalMonto = result.lineas.reduce((acc, l) => acc + toCentavos(l.monto), 0)

    await db.insert(resumenTarjetas).values({
      id: resumenId,
      nombreTarjeta: result.nombreTarjeta,
      periodo: result.periodo,
      totalMonto,
      tarjetaMaestraId: null,
      creadoEn: now,
    })

    if (result.lineas.length > 0) {
      await db.insert(lineasTarjeta).values(result.lineas.map(l => ({
        id: crypto.randomUUID(),
        resumenId,
        cuenta: l.cuenta,
        descripcion: l.descripcion,
        monto: toCentavos(l.monto),
        periodo: l.periodo || result.periodo,
        estado: l.monto > 0 ? "OK" : "",
        tipoLinea: l.tipoLinea,
      })))
    }

    return NextResponse.json({
      id: resumenId,
      nombreTarjeta: result.nombreTarjeta,
      periodo: result.periodo,
      totalMonto,
    })
  } catch (e: unknown) {
    console.error("[POST /api/proveedores/tarjeta]", e)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const rows = await db.select().from(resumenTarjetas).orderBy(desc(resumenTarjetas.creadoEn))
    return NextResponse.json(rows)
  } catch (e: unknown) {
    console.error("[GET /api/proveedores/tarjeta]", e)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
