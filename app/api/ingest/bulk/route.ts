import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { driveArchivos } from "@/lib/db/schema"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { resolverOrgIdEstudio, procesarArchivoClasificado } from "@/lib/orchestrator/procesar-archivo"
import type { FileType } from "@/lib/orchestrator/classifier"

// Ingesta server-to-server (n8n vigila la carpeta de Drive y sube acá). Ruta pública
// (ver proxy.ts) — autenticada por secret compartido en X-Ingest-Token, no por Clerk.
// Contrato: rym-agente/n8n/contrato-endpoint.md.
export const maxDuration = 300

const MAX_BATCH_FILES = 20
const MAX_BATCH_BYTES = 100 * 1024 * 1024 // 100 MB total

type Meta = { fileId?: string; fileName?: string }
type Resultado = {
  fileId?: string
  nombre: string
  clasificacion: FileType
  status: "procesado" | "no_clasificado" | "duplicado" | "error"
  detalle?: string
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("X-Ingest-Token")
  const secret = process.env.INGEST_WEBHOOK_SECRET
  // Longitud primero (no es información sensible para un secreto fijo), timingSafeEqual
  // solo si matchea — evita tirar excepción por buffers de largo distinto.
  const authorized =
    !!token &&
    !!secret &&
    token.length === secret.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Se espera multipart/form-data" }, { status: 400 })
  }
  const files = formData.getAll("files").filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: "No se recibieron archivos" }, { status: 400 })

  let meta: Meta[] = []
  const metaRaw = formData.get("meta")
  if (typeof metaRaw === "string" && metaRaw) {
    try {
      const parsed = JSON.parse(metaRaw)
      if (!Array.isArray(parsed)) throw new Error("no es array")
      meta = parsed
    } catch {
      return NextResponse.json({ error: "meta malformado (se espera JSON array)" }, { status: 400 })
    }
  }

  // Caps anti-amplificación de costo (cada archivo = OCR Mistral + fan-out LLM).
  if (files.length > MAX_BATCH_FILES)
    return NextResponse.json({ error: `Máximo ${MAX_BATCH_FILES} archivos por lote` }, { status: 413 })
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  if (totalBytes > MAX_BATCH_BYTES)
    return NextResponse.json({ error: "Lote demasiado grande (máx 100 MB total)" }, { status: 413 })
  if (files.some(f => f.size > MAX_UPLOAD_BYTES))
    return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })

  // Si la org no se resuelve (ambigua / Clerk caído), todos los archivos fallarían igual.
  let orgId: string
  try {
    orgId = await resolverOrgIdEstudio()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const resultados: Resultado[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    // Los nodos n8n a veces mandan "data" como filename del multipart — meta.fileName lo pisa.
    const nombre = meta[i]?.fileName || file.name
    const fileId = meta[i]?.fileId

    // Dedup por Drive file id: procesado no se repite; pendiente/error se reintentan.
    if (fileId) {
      const [existing] = await db.select({ estado: driveArchivos.estado, clasificacion: driveArchivos.clasificacion })
        .from(driveArchivos).where(eq(driveArchivos.id, fileId)).limit(1)
      if (existing?.estado === "procesado") {
        resultados.push({ fileId, nombre, clasificacion: (existing.clasificacion as FileType) ?? "desconocido", status: "duplicado" })
        continue
      }
      await db.insert(driveArchivos)
        .values({ id: fileId, nombre, mimeType: file.type || "application/octet-stream", tamano: file.size, estado: "pendiente" })
        .onConflictDoUpdate({
          target: driveArchivos.id,
          set: { nombre, mimeType: file.type || "application/octet-stream", tamano: file.size, estado: "pendiente", errorMensaje: null },
        })
    }

    try {
      const buffer = await file.arrayBuffer()
      const r = await procesarArchivoClasificado(buffer, nombre, orgId, "n8n")

      if (r.clasificacion === "desconocido") {
        // No marcar "procesado": un reenvío (p.ej. con mejor nombre) debe poder reintentar.
        if (fileId) await db.update(driveArchivos)
          .set({ clasificacion: r.clasificacion, estado: "error", errorMensaje: "no clasificado" })
          .where(eq(driveArchivos.id, fileId))
        resultados.push({ fileId, nombre, clasificacion: r.clasificacion, status: "no_clasificado" })
        continue
      }

      if (fileId) await db.update(driveArchivos)
        .set({ clasificacion: r.clasificacion, estado: "procesado", procesadoEn: new Date().toISOString() })
        .where(eq(driveArchivos.id, fileId))
      resultados.push({ fileId, nombre, clasificacion: r.clasificacion, status: "procesado", detalle: r.detalle })
    } catch (err) {
      // Un archivo con error no tira el batch — se reporta en su entrada.
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ingest-bulk] error procesando ${nombre}${fileId ? ` (${fileId})` : ""}:`, err)
      if (fileId) await db.update(driveArchivos)
        .set({ estado: "error", errorMensaje: msg })
        .where(eq(driveArchivos.id, fileId))
      resultados.push({ fileId, nombre, clasificacion: "desconocido", status: "error", detalle: msg })
    }
  }

  return NextResponse.json({ resultados })
}
