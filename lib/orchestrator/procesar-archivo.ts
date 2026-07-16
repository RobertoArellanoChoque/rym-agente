import crypto from "crypto"
import { eq, and, isNotNull, isNull } from "drizzle-orm"
import { clerkClient } from "@clerk/nextjs/server"
import { db } from "@/lib/db"
import { conciliaciones, asientos as asientosTable } from "@/lib/db/schema"
import { extractRawText } from "@/lib/extractos/raw-text"
import { classifyText, type FileType } from "@/lib/orchestrator/classifier"
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

// orgId "del estudio" para la ingesta server-to-server (/api/ingest/bulk corre sin
// sesión Clerk, así que requireOrgId()/currentOrgId() no sirven acá).
// Prioridad: env var explícita (DRIVE_SYNC_ORG_ID) > única organización en Clerk.
// Con 0 o >1 orgs no adivinamos — mejor fallar explícito a atribuir datos a la org
// equivocada. Cacheado en memoria del proceso: no pega la API de Clerk por archivo,
// y no hace falta TTL — se invalida solo con un restart del proceso.
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
      `DRIVE_SYNC_ORG_AMBIGUOUS: se esperaba exactamente 1 organización en Clerk para atribuir la ingesta, hay ${totalCount}. Configurá DRIVE_SYNC_ORG_ID explícitamente.`
    )
  }

  cachedOrgId = data[0].id
  return cachedOrgId
}

// Busca conciliación existente (mismo banco + período + org) o arma un id nuevo. Mismo
// criterio de agrupación que app/api/conciliacion/ingest-batch/route.ts, pero
// consultando la DB en vez de agrupar en memoria (los archivos llegan de a uno).
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
// persistido en una ingesta anterior).
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

export type ResultadoArchivo = { clasificacion: FileType; detalle?: string }

/**
 * Clasifica un archivo y lo despacha al módulo correcto (banco/tango/tarjeta/pago).
 * "desconocido" NO tira — devuelve la clasificación para que el caller decida
 * (p.ej. status "no_clasificado" en /api/ingest/bulk). Los errores de extracción/
 * persistencia sí tiran; el caller los reporta por archivo.
 */
export async function procesarArchivoClasificado(
  buffer: ArrayBuffer,
  filename: string,
  orgId: string,
  origen: string,
): Promise<ResultadoArchivo> {
  let rawText: string
  try {
    rawText = await extractRawText(buffer, filename)
  } catch (err) {
    // Extensión no soportada (txt, zip, etc.) = archivo no clasificable, no un error
    // transitorio — reintentar no lo va a arreglar (n8n lo mueve a no-clasificados/).
    if (err instanceof Error && err.message.startsWith("Formato no soportado")) {
      return { clasificacion: "desconocido", detalle: err.message }
    }
    throw err
  }
  const classification = await classifyText(rawText)

  switch (classification.type) {
    case "banco": {
      const ext = await extraerBanco(buffer, filename)
      const sessionId = await findOrCreateConciliacionBanco(ext.bankResult.bankId, ext.periodo, orgId)
      await persistBanco(sessionId, ext, orgId)
      await runMatchingIfComplete(sessionId, orgId)
      return { clasificacion: "banco", detalle: `conciliación ${ext.periodo ?? "?"} ${ext.bankResult.bankName}` }
    }
    case "tango": {
      const mayor = await extraerTango(buffer, filename)
      const { id: sessionId, isNew } = await findConciliacionParaTango(mayor.periodo, orgId)
      await persistTango(sessionId, mayor, orgId)
      if (isNew) await upsertConciliacion(sessionId, { label: `Mayor Tango — ${nombreMes(mayor.periodo)}` }, orgId)
      await runMatchingIfComplete(sessionId, orgId)
      return { clasificacion: "tango", detalle: `mayor ${mayor.periodo ?? "?"}` }
    }
    case "tarjeta": {
      const { result } = await procesarExtractoTarjeta(buffer, filename)
      await persistTarjeta(result, origen, orgId)
      return { clasificacion: "tarjeta", detalle: result.nombreTarjeta }
    }
    case "pago_retencion": {
      const { result } = await procesarComprobantePago(buffer, filename)
      await persistPago(result, origen, orgId)
      return { clasificacion: "pago_retencion" }
    }
    default:
      return { clasificacion: "desconocido" }
  }
}
