import crypto from "crypto"
import type { drive_v3 } from "googleapis"
import { eq, and, isNotNull, isNull } from "drizzle-orm"
import { clerkClient } from "@clerk/nextjs/server"
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
// Google Sheets nativo no tiene bytes descargables vía files.get (alt=media 403 File not
// found) — hay que exportarlo a xlsx. Tampoco trae extensión en el nombre, así que el resto
// del pipeline (clasificación + extractores, todos dispatch-por-extensión) usa nombreEfectivo.
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet"
const GOOGLE_SHEET_EXPORT_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

// orgId "del estudio" para todo lo que sincroniza Drive. syncDrive() corre disparada
// por un webhook público (sin sesión Clerk), así que requireOrgId()/currentOrgId()
// (lib/auth/current-user.ts, dependen de auth() = contexto de request) no sirven acá.
// Prioridad: env var explícita (DRIVE_SYNC_ORG_ID) > única organización en Clerk.
// Con 0 o >1 orgs no adivinamos — mejor que el sync falle explícito (se loguea como
// error en driveArchivos vía el try/catch de processFile) a que atribuya datos a la
// org equivocada. Cacheado en memoria del proceso: no pega la API de Clerk en cada
// archivo/sync, y no hace falta TTL — se invalida solo con un restart del proceso.
let cachedOrgId: string | null = null

export async function resolverOrgIdEstudio(): Promise<string> {
  if (cachedOrgId) return cachedOrgId

  const envOrgId = process.env.DRIVE_SYNC_ORG_ID
  if (envOrgId) {
    cachedOrgId = envOrgId
    return cachedOrgId
  }

  const client = await clerkClient()
  const { data, totalCount } = await client.organizations.getOrganizationList({ limit: 2 })
  if (totalCount !== 1) {
    throw new Error(
      `DRIVE_SYNC_ORG_AMBIGUOUS: se esperaba exactamente 1 organización en Clerk para atribuir el sync de Drive, hay ${totalCount}. Configurá DRIVE_SYNC_ORG_ID explícitamente.`
    )
  }

  cachedOrgId = data[0].id
  return cachedOrgId
}

// registry.ts ya acepta orgId en upsertConciliacion (lo setea al INSERT), pero
// persistBanco/persistTango (lib/conciliacion/ingest-banco.ts, ingest-tango.ts —
// fuera de mi scope) todavía llaman a su upsertConciliacion interno SIN orgId, así
// que la fila que ellos crean queda con orgId null. Belt-and-suspenders: forzamos
// acá el orgId correcto con un UPDATE directo apenas la fila existe. Cuando ese
// track pase orgId a persistBanco/persistTango, este UPDATE pasa a ser un no-op
// redundante (se puede borrar entonces) pero no rompe nada mientras tanto.
async function setConciliacionOrgId(sessionId: string, orgId: string): Promise<void> {
  await db.update(conciliaciones).set({ orgId }).where(eq(conciliaciones.id, sessionId))
}

// Busca conciliación existente (mismo banco + período + org) o arma un id nuevo. Mismo
// criterio de agrupación que app/api/conciliacion/ingest-batch/route.ts, pero
// consultando la DB en vez de agrupar en memoria (los archivos de Drive llegan
// de a uno, no en batch).
async function findOrCreateConciliacionBanco(bankId: string, periodo: string | undefined, orgId: string): Promise<string> {
  if (periodo) {
    const [existing] = await db.select({ id: conciliaciones.id }).from(conciliaciones)
      .where(and(eq(conciliaciones.bancoId, bankId), eq(conciliaciones.periodo, periodo), eq(conciliaciones.orgId, orgId)))
      .limit(1)
    if (existing) return existing.id
  }
  return crypto.randomUUID()
}

// Busca la conciliación de banco ya creada en el mismo período (misma org); si no hay, arma sesión nueva (solo-tango).
// Mismo criterio de desambiguación que ingest-batch/route.ts: candidato único
// banco+período sin tango todavía (asientosCount null) → usarlo. 0 o >1
// candidatos → sesión nueva en vez de adivinar con "el más reciente" (evita
// pisar la conciliación equivocada cuando hay varias del mismo banco/período).
async function findConciliacionParaTango(periodo: string | undefined, orgId: string): Promise<{ id: string; isNew: boolean }> {
  if (periodo) {
    const candidatos = await db.select({ id: conciliaciones.id }).from(conciliaciones)
      .where(and(
        eq(conciliaciones.periodo, periodo),
        eq(conciliaciones.orgId, orgId),
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
async function runMatchingIfComplete(sessionId: string, orgId: string): Promise<void> {
  const conc = await getConciliacion(sessionId, orgId)
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
    }, orgId, tx)
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
  const esGoogleSheet = mimeType === GOOGLE_SHEET_MIME
  const nombreEfectivo = esGoogleSheet && !/\.(xlsx|xls|csv)$/i.test(nombre) ? `${nombre}.xlsx` : nombre

  await db.insert(driveArchivos)
    .values({ id: fileId, nombre, mimeType, tamano, estado: "pendiente", createdAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: driveArchivos.id,
      set: { nombre, mimeType, tamano, estado: "pendiente", errorMensaje: null },
    })

  try {
    // Primero: si no se puede resolver la org del estudio (ambigua o Clerk caído),
    // cortamos acá — cae al catch de abajo y queda logueado como error en driveArchivos.
    const orgId = await resolverOrgIdEstudio()

    const drive = getDriveClient()
    const { data } = esGoogleSheet
      ? await drive.files.export({ fileId, mimeType: GOOGLE_SHEET_EXPORT_MIME }, { responseType: "arraybuffer" })
      : await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" })
    const buffer = data as ArrayBuffer

    const rawText = await extractRawText(buffer, nombreEfectivo)
    const classification = classifyText(rawText)
    await db.update(driveArchivos).set({ clasificacion: classification.type }).where(eq(driveArchivos.id, fileId))

    switch (classification.type) {
      case "banco": {
        const ext = await extraerBanco(buffer, nombreEfectivo)
        const sessionId = await findOrCreateConciliacionBanco(ext.bankResult.bankId, ext.periodo, orgId)
        await persistBanco(sessionId, ext)
        await setConciliacionOrgId(sessionId, orgId)
        await runMatchingIfComplete(sessionId, orgId)
        break
      }
      case "tango": {
        const mayor = await extraerTango(buffer, nombreEfectivo)
        const { id: sessionId, isNew } = await findConciliacionParaTango(mayor.periodo, orgId)
        await persistTango(sessionId, mayor)
        await setConciliacionOrgId(sessionId, orgId)
        if (isNew) await upsertConciliacion(sessionId, { label: `Mayor Tango — ${nombreMes(mayor.periodo)}` }, orgId)
        await runMatchingIfComplete(sessionId, orgId)
        break
      }
      case "tarjeta": {
        const { result } = await procesarExtractoTarjeta(buffer, nombreEfectivo)
        await persistTarjeta(result, CREATED_BY, orgId)
        break
      }
      case "pago_retencion": {
        const { result } = await procesarComprobantePago(buffer, nombreEfectivo)
        await persistPago(result, CREATED_BY, orgId)
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
