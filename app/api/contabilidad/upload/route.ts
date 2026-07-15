import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { retencionesArca, retencionesTango, sesiones } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { parseArcaXlsx } from "@/lib/contabilidad/parsers/arca"
import { parseTangoXlsx } from "@/lib/contabilidad/parsers/tango"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { currentUserId, requireOrgId } from "@/lib/auth/current-user"

async function detectTipo(buffer: ArrayBuffer): Promise<"arca" | "tango"> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return "arca"
  const vals = ws.getRow(1).values as unknown[]
  const c1 = String(vals[1] ?? "").trim()
  return /^COD[_\s]?CTA/i.test(c1) ? "tango" : "arca"
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const sesionId = form.get("sesionId") as string | null

    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
    if (file.size > MAX_UPLOAD_BYTES)
      return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })

    const ext = file.name.toLowerCase().split(".").pop()
    if (!["xlsx", "xls"].includes(ext ?? ""))
      return NextResponse.json({ error: "Solo se aceptan archivos Excel (.xlsx)" }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const tipo = await detectTipo(buffer)
    const loteId = crypto.randomUUID()
    const now = new Date().toISOString()
    const userId = await currentUserId()
    const orgId = await requireOrgId()

    if (tipo === "tango") {
      const { filas } = await parseTangoXlsx(buffer)
      if (!filas.length)
        return NextResponse.json({ error: "No se encontraron asientos en el archivo" }, { status: 422 })
      // Insert + merge de sesión en UNA transacción con lock de fila (FOR UPDATE):
      // serializa arca+tango concurrentes sobre la misma sesión (evita lost-update).
      await db.transaction(async (tx) => {
        await tx.insert(retencionesTango).values(filas.map(f => ({
          id: crypto.randomUUID(), loteId,
          codCta: f.codCta, descCta: f.descCta, fecha: f.fecha,
          codComp: f.codComp, nComp: f.nComp,
          debe: f.debe, haber: f.haber, saldo: f.saldo, creadoEn: now, createdBy: userId, orgId,
        })))
        if (sesionId) {
          const [existing] = await tx.select().from(sesiones).where(and(eq(sesiones.id, sesionId), eq(sesiones.orgId, orgId))).for("update").limit(1)
          const datos = { ...(existing?.datos ?? {}) } as Record<string, unknown>
          datos.tango = { count: filas.length, filas }
          const estado = datos.arca && datos.tango ? "completado" : "activo"
          await tx.update(sesiones).set({ datos, estado, updatedAt: now, updatedBy: userId }).where(and(eq(sesiones.id, sesionId), eq(sesiones.orgId, orgId)))
        }
      })
      return NextResponse.json({ tipo: "tango", count: filas.length, filas })
    } else {
      const { jurisdiccion, filas } = await parseArcaXlsx(buffer)
      if (!filas.length)
        return NextResponse.json({ error: "No se encontraron retenciones en el archivo" }, { status: 422 })
      await db.transaction(async (tx) => {
        await tx.insert(retencionesArca).values(filas.map(f => ({
          id: crypto.randomUUID(), loteId, jurisdiccion,
          cuitAgente: f.cuitAgente, fechaRetencion: f.fechaRetencion,
          tipo: f.tipo, letra: f.letra, nroComprobante: f.nroComprobante,
          nroComprOrigen: f.nroComprOrigen, importe: f.importe, creadoEn: now, createdBy: userId, orgId,
        })))
        if (sesionId) {
          const [existing] = await tx.select().from(sesiones).where(and(eq(sesiones.id, sesionId), eq(sesiones.orgId, orgId))).for("update").limit(1)
          const datos = { ...(existing?.datos ?? {}) } as Record<string, unknown>
          datos.arca = { jurisdiccion, count: filas.length, filas }
          const estado = datos.arca && datos.tango ? "completado" : "activo"
          await tx.update(sesiones).set({ datos, estado, updatedAt: now, updatedBy: userId }).where(and(eq(sesiones.id, sesionId), eq(sesiones.orgId, orgId)))
        }
      })
      return NextResponse.json({ tipo: "arca", jurisdiccion, count: filas.length, filas })
    }
  } catch (err) {
    console.error("[contabilidad/upload]", err)
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 })
  }
}
