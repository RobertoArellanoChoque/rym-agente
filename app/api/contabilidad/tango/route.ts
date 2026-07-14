import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { retencionesTango } from "@/lib/db/schema"
import { parseTangoXlsx } from "@/lib/contabilidad/parsers/tango"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { desc } from "drizzle-orm"
import { currentUserId } from "@/lib/auth/current-user"

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
    const { filas } = await parseTangoXlsx(buffer)

    if (!filas.length) return NextResponse.json({ error: "No se encontraron datos en el archivo" }, { status: 422 })

    const loteId = crypto.randomUUID()
    const now = new Date().toISOString()
    const userId = await currentUserId()

    await db.insert(retencionesTango).values(filas.map(f => ({
      id: crypto.randomUUID(),
      loteId,
      codCta: f.codCta,
      descCta: f.descCta,
      fecha: f.fecha,
      codComp: f.codComp,
      nComp: f.nComp,
      debe: f.debe,
      haber: f.haber,
      saldo: f.saldo,
      creadoEn: now,
      createdBy: userId,
    })))

    return NextResponse.json({ loteId, count: filas.length, filas })
  } catch (err) {
    console.error("[contabilidad/tango]", err)
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 })
  }
}

export async function GET() {
  const rows = await db.select().from(retencionesTango).orderBy(desc(retencionesTango.creadoEn))
  return NextResponse.json(rows)
}
