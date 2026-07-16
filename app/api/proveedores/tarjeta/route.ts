import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { resumenTarjetas } from "@/lib/db/schema"
import { procesarExtractoTarjeta } from "@/lib/tarjetas/extractor"
import { persistTarjeta } from "@/lib/tarjetas/persist"
import { and, desc, eq } from "drizzle-orm"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { currentUserId, requireOrgId } from "@/lib/auth/current-user"
import { rateLimit, ipOf } from "@/lib/rate-limit"

interface RawLinea {
  cuenta: string
  descripcion: string
  monto: number // already centavos
  periodo: string
  tipoLinea: "cargo" | "impuesto" | "devolucion"
}

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`upload:${ipOf(req)}`, 30, 60_000)))
    return NextResponse.json({ error: "Demasiadas solicitudes, esperá un momento" }, { status: 429 })
  try {
    const orgId = await requireOrgId()
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

      const { resumenId, totalMonto } = await persistTarjeta({
        nombreTarjeta: body.nombreTarjeta,
        periodo: body.periodo,
        // rawLineas.monto ya viene en centavos (ver RawLinea); persistTarjeta
        // vuelve a aplicar toCentavos, así que se pasa el valor en pesos decimal.
        lineas: body.rawLineas.map(l => ({
          cuenta: l.cuenta,
          descripcion: l.descripcion,
          monto: l.monto / 100,
          periodo: l.periodo,
          tipoLinea: l.tipoLinea === "cargo" ? "impuesto" : l.tipoLinea,
        })),
      }, await currentUserId(), orgId)

      if (body.tarjetaMaestraId) {
        await db.update(resumenTarjetas)
          .set({ tarjetaMaestraId: body.tarjetaMaestraId })
          .where(and(eq(resumenTarjetas.id, resumenId), eq(resumenTarjetas.orgId, orgId)))
      }

      return NextResponse.json({ id: resumenId, nombreTarjeta: body.nombreTarjeta, periodo: body.periodo, totalMonto })
    }

    // Path B: raw PDF upload (direct import without preview)
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })

    const ext = file.name.toLowerCase().split(".").pop()
    if (!["pdf", "xlsx", "xls", "csv"].includes(ext ?? "")) {
      return NextResponse.json({ error: "Formato no soportado. Usá PDF, Excel o CSV." }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })
    }

    const buffer = await file.arrayBuffer()

    let extraction
    try {
      extraction = await procesarExtractoTarjeta(buffer, file.name)
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
    const { resumenId, totalMonto } = await persistTarjeta(result, await currentUserId(), orgId)

    return NextResponse.json({
      id: resumenId,
      nombreTarjeta: result.nombreTarjeta,
      periodo: result.periodo,
      totalMonto,
    })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[POST /api/proveedores/tarjeta]", e)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const orgId = await requireOrgId()
    const rows = await db.select().from(resumenTarjetas)
      .where(eq(resumenTarjetas.orgId, orgId))
      .orderBy(desc(resumenTarjetas.creadoEn))
    return NextResponse.json(rows)
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[GET /api/proveedores/tarjeta]", e)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
