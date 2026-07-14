import crypto from "crypto"
import type { drive_v3 } from "googleapis"
import { eq, and, isNotNull, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  driveArchivos, driveSyncState, conciliaciones,
  asientos as asientosTable,
} from "@/lib/db/schema"
import { getDriveClient, driveFolderId } from "@/lib/drive/client"
import { extractRawText } from "@/lib/extractos/raw-text"
import { classifyText } from "@/lib/orchestrator/classifier"
import { extraerBanco, persistBanco } from "@/lib/conciliacion/ingest-banco"
import { extraerTango, persistTango } from "@/lib/conciliacion/ingest-tango"
import { upsertConciliacion, getConciliacion } from "@/lib/conciliacion/registry"
import { conciliar } from "@/lib/conciliacion/matching"
import { reemplazarMatchesYDiscrepancias } from "@/lib/conciliacion/persist"
import { rowToAsiento } from "@/lib/conciliacion/mappers"
import { cargarMovimientosActivos } from "@/lib/conciliacion/movimientos-activos"
import { nombreMes } from "@/lib/conciliacion/periodo"
import { procesarExtractoTarjeta } from "@/lib/tarjetas/extractor"
import { persistTarjeta } from "@/lib/tarjetas/persist"
import { procesarComprobantePago } from "@/lib/ventas/extractor"
import { persistPago } from "@/lib/ventas/persist"
import type { Asiento } from "@/lib/types"

const CREATED_BY = "drive-sync"
const ERROR_FORMATO_NO_SOPORTADO = "Formato no soportado para tarjetas vía Drive, usar carga manual"

// Busca conciliación existente (mismo banco + período) o arma un id nuevo. Mismo
// criterio de agrupación que app/api/conciliacion/ingest-batch/route.ts, pero
// consultando la DB en vez de agrupar en memoria (los archivos de Drive llegan
// de a uno, no en batch).
async function findOrCreateConciliacionBanco(bankId: string, periodo: string | undefined): Promise<string> {
  if (periodo) {
    const [existing] = await db.select({ id: conciliaciones.id }).from(conciliaciones)
      .where(and(eq(conciliaciones.bancoId, bankId), eq(conciliaciones.periodo, periodo)))
      .limit(1)
    if (existing) return existing.id
  }
  return crypto.randomUUID()
}

// Busca la conciliación de banco ya creada en el mismo período; si no hay, arma sesión nueva (solo-tango).
// Mismo criterio de desambiguación que ingest-batch/route.ts: candidato único
// banco+período sin tango todavía (asientosCount null) → usarlo. 0 o >1
// candidatos → sesión nueva en vez de adivinar con "el más reciente" (evita
// pisar la conciliación equivocada cuando hay varias del mismo banco/período).
async function findConciliacionParaTango(periodo: string | undefined): Promise<{ id: string; isNew: boolean }> {
  if (periodo) {
    const candidatos = await db.select({ id: conciliaciones.id }).from(conciliaciones)
      .where(and(
        eq(conciliaciones.periodo, periodo),
        isNotNull(conciliaciones.bancoId),
        isNull(conciliaciones.asientosCount),
      ))
    if (candidatos.length === 1) return { id: candidatos[0].id, isNew: false }
  }
  return { id: crypto.randomUUID(), isNew: true }
}

// Si la conciliación ya tiene ambos lados (banco + tango), corre matching. Mismo
// bloque que app/api/conciliacion/ingest-batch/route.ts paso 3, pero relee de DB
// en vez de usar los datos recién extraídos en memoria (el otro lado pudo haberse
// persistido en un sync anterior).
async function runMatchingIfComplete(sessionId: string): Promise<void> {
  const conc = await getConciliacion(sessionId)
  if (!conc || !conc.movimientosCount || !conc.asientosCount) return

  const [{ movimientos: movs }, asientoRows] = await Promise.all([
    cargarMovimientosActivos(sessionId),
    db.select().from(asientosTable).where(eq(asientosTable.conciliacionId, sessionId)),
  ])
  const asientosData: Asiento[] = asientoRows.map(rowToAsiento)

  const res = conciliar(movs, asientosData)
  await db.transaction(async (tx) => {
    await reemplazarMatchesYDiscrepancias(sessionId, res.matches, res.discrepancias, tx)
    await upsertConciliacion(sessionId, {
      stage: "done",
      movimientosCount: res.movimientos.length, asientosCount: res.asientos.length,
      saldoBanco: res.saldoBanco, saldoMayor: res.saldoMayor, diferencia: res.diferencia,
    }, tx)
  })
}

// Procesa un único archivo de Drive: descarga, clasifica, despacha al pipeline
// correspondiente y actualiza driveArchivos. Nunca tira — devuelve ok/error para
// que syncDrive lleve el conteo.
async function processFile(file: drive_v3.Schema$File): Promise<boolean> {
  const fileId = file.id
  if (!fileId) return false
  const nombre = file.name ?? "sin-nombre"
  const mimeType = file.mimeType ?? "application/octet-stream"
  const tamano = Number(file.size ?? 0)

  await db.insert(driveArchivos)
    .values({ id: fileId, nombre, mimeType, tamano, estado: "pendiente", createdAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: driveArchivos.id,
      set: { nombre, mimeType, tamano, estado: "pendiente", errorMensaje: null },
    })

  try {
    const drive = getDriveClient()
    const { data } = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" })
    const buffer = data as ArrayBuffer

    const rawText = await extractRawText(buffer, nombre)
    const classification = classifyText(rawText)
    await db.update(driveArchivos).set({ clasificacion: classification.type }).where(eq(driveArchivos.id, fileId))

    const extFile = nombre.split(".").pop()?.toLowerCase()

    switch (classification.type) {
      case "banco": {
        const ext = await extraerBanco(buffer, nombre)
        const sessionId = await findOrCreateConciliacionBanco(ext.bankResult.bankId, ext.periodo)
        await persistBanco(sessionId, ext)
        await runMatchingIfComplete(sessionId)
        break
      }
      case "tango": {
        const mayor = await extraerTango(buffer, nombre)
        const { id: sessionId, isNew } = await findConciliacionParaTango(mayor.periodo)
        await persistTango(sessionId, mayor)
        if (isNew) await upsertConciliacion(sessionId, { label: `Mayor Tango — ${nombreMes(mayor.periodo)}` })
        await runMatchingIfComplete(sessionId)
        break
      }
      case "tarjeta": {
        if (extFile !== "pdf") throw new Error(ERROR_FORMATO_NO_SOPORTADO)
        const { result } = await procesarExtractoTarjeta(buffer)
        await persistTarjeta(result, CREATED_BY)
        break
      }
      case "pago_retencion": {
        if (extFile !== "pdf") throw new Error(ERROR_FORMATO_NO_SOPORTADO)
        const { result } = await procesarComprobantePago(buffer)
        await persistPago(result, CREATED_BY)
        break
      }
      default:
        throw new Error("No se pudo clasificar el archivo")
    }

    await db.update(driveArchivos)
      .set({ estado: "procesado", procesadoEn: new Date().toISOString() })
      .where(eq(driveArchivos.id, fileId))
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[drive-sync] error procesando ${nombre} (${fileId}):`, err)
    await db.update(driveArchivos).set({ estado: "error", errorMensaje: msg }).where(eq(driveArchivos.id, fileId))
    return false
  }
}

/**
 * Sincroniza archivos nuevos/modificados de la carpeta de Drive vigilada.
 * Pagina drive.changes.list desde el pageToken guardado (o lo inicializa la
 * primera vez), filtra por carpeta raíz configurada, y despacha cada archivo
 * al pipeline de ingesta reusable según su clasificación.
 */
export async function syncDrive(): Promise<{ procesados: number; errores: number }> {
  const drive = getDriveClient()
  const folderId = driveFolderId()

  const [state] = await db.select().from(driveSyncState).where(eq(driveSyncState.id, "default")).limit(1)
  let pageToken = state?.pageToken ?? null
  if (!pageToken) {
    const { data } = await drive.changes.getStartPageToken({})
    pageToken = data.startPageToken ?? null
  }
  if (!pageToken) throw new Error("No se pudo obtener pageToken inicial de Drive")

  let procesados = 0
  let errores = 0
  let nextPageToken: string | undefined = pageToken
  let newStartPageToken: string | null = null

  while (nextPageToken) {
    const token: string = nextPageToken
    const res = await drive.changes.list({
      pageToken: token,
      spaces: "drive",
      fields: "newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, mimeType, size, parents, trashed))",
    })
    const data = res.data

    for (const change of data.changes ?? []) {
      const file = change.file
      if (change.removed || file?.trashed) continue
      if (!file?.id || !file.parents?.includes(folderId)) continue

      const [existing] = await db.select({ estado: driveArchivos.estado }).from(driveArchivos)
        .where(eq(driveArchivos.id, file.id)).limit(1)
      if (existing?.estado === "procesado") continue

      const ok = await processFile(file)
      if (ok) procesados++
      else errores++
    }

    nextPageToken = data.nextPageToken ?? undefined
    if (data.newStartPageToken) newStartPageToken = data.newStartPageToken
  }

  if (newStartPageToken) {
    const now = new Date().toISOString()
    await db.insert(driveSyncState)
      .values({ id: "default", pageToken: newStartPageToken, updatedAt: now })
      .onConflictDoUpdate({ target: driveSyncState.id, set: { pageToken: newStartPageToken, updatedAt: now } })
  }

  return { procesados, errores }
}
