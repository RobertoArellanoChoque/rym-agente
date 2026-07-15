import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { retencionesArca } from "@/lib/db/schema"
import { parseArcaXlsx } from "@/lib/contabilidad/parsers/arca"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { desc, eq } from "drizzle-orm"
import { currentUserId, requireOrgId } from "@/lib/auth/current-user"

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })

    const ext = file.name.toLowerCase().split(".").pop()
    if (!["xlsx", "xls"].includes(ext ?? "")) {
      return NextResponse.json({ error: "Solo se aceptan archivos Excel (.xlsx)" }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const { jurisdiccion, filas } = await parseArcaXlsx(buffer)

    if (!filas.length) return NextResponse.json({ error: "No se encontraron datos en el archivo" }, { status: 422 })

    const loteId = crypto.randomUUID()
    const now = new Date().toISOString()
    const userId = await currentUserId()
    const orgId = await requireOrgId()

    await db.insert(retencionesArca).values(filas.map(f => ({
      id: crypto.randomUUID(),
      loteId,
      jurisdiccion,
      cuitAgente: f.cuitAgente,
      fechaRetencion: f.fechaRetencion,
      tipo: f.tipo,
      letra: f.letra,
      nroComprobante: f.nroComprobante,
      nroComprOrigen: f.nroComprOrigen,
      importe: f.importe,
      creadoEn: now,
      createdBy: userId,
      orgId,
    })))

    return NextResponse.json({ loteId, count: filas.length, jurisdiccion, filas })
  } catch (err) {
    console.error("[contabilidad/arca]", err)
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 })
  }
}

export async function GET() {
  const orgId = await requireOrgId()
  const rows = await db.select().from(retencionesArca)
    .where(eq(retencionesArca.orgId, orgId))
    .orderBy(desc(retencionesArca.creadoEn))
  return NextResponse.json(rows)
}
