import { NextRequest, NextResponse } from "next/server"
import { sessionExists } from "@/lib/sessions/manager"
import { parseTangoExcel, parseTangoCsv } from "@/lib/tango/parser"
import { upsertConciliacion } from "@/lib/conciliacion/registry"
import { db } from "@/lib/db"
import { asientos as asientosTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const sessionId = formData.get("sessionId") as string | null

  if (!file) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
  }
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
  }
  if (!(await sessionExists(sessionId))) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
  }

  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
    return NextResponse.json(
      { error: "Formato no soportado. Subí un archivo de Tango (.xlsx, .xls o .csv)." },
      { status: 400 }
    )
  }

  const buffer = await file.arrayBuffer()

  let asientos
  try {
    asientos = ext === "csv"
      ? await parseTangoCsv(buffer)
      : await parseTangoExcel(buffer)
  } catch (err) {
    console.error("[tango/route] Parse error:", err)
    return NextResponse.json({ error: "Error procesando el archivo de Tango" }, { status: 500 })
  }

  if (asientos.length === 0) {
    return NextResponse.json(
      { error: "No se encontraron asientos en el archivo. Verificá el formato." },
      { status: 400 }
    )
  }

  const saldoMayor = [...asientos]
    .filter(a => a.saldo !== undefined)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .at(-1)?.saldo

  // Replace existing asientos for this session (re-upload scenario)
  await db.delete(asientosTable).where(eq(asientosTable.conciliacionId, sessionId))
  if (asientos.length > 0) {
    await db.insert(asientosTable).values(asientos.map(a => ({
      id: a.id,
      conciliacionId: sessionId,
      fecha: a.fecha,
      descripcion: a.descripcion,
      referencia: a.referencia,
      monto: a.monto,
      cuenta: a.cuenta,
      debe: a.debe ?? null,
      haber: a.haber ?? null,
      saldo: a.saldo ?? null,
    })))
  }

  await upsertConciliacion(sessionId, {
    stage: "tango-done",
    asientosCount: asientos.length,
    saldoMayor,
  })

  return NextResponse.json({
    sessionId,
    asientos,
    total: asientos.length,
  })
}
