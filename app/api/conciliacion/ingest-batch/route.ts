import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { extraerBanco, persistBanco, type ExtractoBanco } from "@/lib/conciliacion/ingest-banco"
import { extraerTango, persistTango, type MayorTango } from "@/lib/conciliacion/ingest-tango"
import { extractRawText } from "@/lib/extractos/raw-text"
import { classifyText } from "@/lib/orchestrator/classifier"
import { conciliar } from "@/lib/conciliacion/matching"
import { reemplazarMatchesYDiscrepancias } from "@/lib/conciliacion/persist"
import { upsertConciliacion } from "@/lib/conciliacion/registry"
import { db } from "@/lib/db"
import { nombreMes } from "@/lib/conciliacion/periodo"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { requireOrgId } from "@/lib/auth/current-user"
import type { Movimiento } from "@/lib/types"

const MAX_BATCH_FILES = 20
const MAX_BATCH_BYTES = 100 * 1024 * 1024 // 100 MB total

// Decide banco vs tango sin doble-OCR: pdf→banco, csv→tango, xlsx→peek texto.
async function clasificar(buffer: ArrayBuffer, filename: string): Promise<"banco" | "tango" | "desconocido"> {
  const ext = filename.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return "banco"
  if (ext === "csv") return "tango"
  if (ext === "xlsx" || ext === "xls") {
    try {
      const raw = await extractRawText(buffer, filename)
      const c = classifyText(raw)
      if (c.type === "tango") return "tango"
      if (c.type === "banco") return "banco"
      return /debe|haber|asiento|mayor de cuentas/i.test(raw) ? "tango" : "banco"
    } catch { return "desconocido" }
  }
  return "desconocido"
}

type BancoItem = { kind: "banco"; periodo?: string; bankId: string; ext: ExtractoBanco; file: string }
type TangoItem = { kind: "tango"; periodo?: string; mayor: MayorTango; file: string }

export async function POST(req: NextRequest) {
  // Chequeo temprano: persistBanco/persistTango exigen org activa igual, pero acá evitamos
  // gastar OCR/LLM (el costo real del batch) en archivos que van a fallar al persistir.
  let orgId: string
  try {
    orgId = await requireOrgId()
  } catch {
    return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
  }

  const formData = await req.formData()
  const files = formData.getAll("files").filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: "No se recibieron archivos" }, { status: 400 })
  // Caps anti-amplificación de costo (cada archivo = OCR Mistral + fan-out LLM). Auth la da proxy.ts.
  if (files.length > MAX_BATCH_FILES)
    return NextResponse.json({ error: `Máximo ${MAX_BATCH_FILES} archivos por lote` }, { status: 400 })
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  if (totalBytes > MAX_BATCH_BYTES)
    return NextResponse.json({ error: "Lote demasiado grande (máx 100 MB total)" }, { status: 400 })

  const bancos: BancoItem[] = []
  const tangos: TangoItem[] = []
  const errores: { file: string; error: string }[] = []

  // 1. Clasificar + extraer cada archivo (sin tocar la DB todavía)
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) { errores.push({ file: file.name, error: "Archivo demasiado grande (máx 20 MB)" }); continue }
    try {
      const buffer = await file.arrayBuffer()
      const kind = await clasificar(buffer, file.name)
      if (kind === "banco") {
        const ext = await extraerBanco(buffer, file.name)
        bancos.push({ kind: "banco", periodo: ext.periodo, bankId: ext.bankResult.bankId, ext, file: file.name })
      } else if (kind === "tango") {
        const mayor = await extraerTango(buffer, file.name)
        tangos.push({ kind: "tango", periodo: mayor.periodo, mayor, file: file.name })
      } else {
        errores.push({ file: file.name, error: "No se pudo clasificar (¿banco o Tango?)" })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errores.push({ file: file.name, error: msg })
    }
  }

  // 2. Agrupar en sesiones. Clave banco = (bankId, periodo). Tango se une por período.
  type Grupo = { sessionId: string; label?: string; banco?: BancoItem; tango?: TangoItem }
  const grupos = new Map<string, Grupo>()
  const keyBanco = (b: BancoItem) => `${b.bankId}|${b.periodo ?? "?"}`

  for (const b of bancos) {
    const key = keyBanco(b)
    // Dos extractos del mismo banco+período colisionan: no pisar el primero en silencio.
    if (grupos.has(key)) {
      errores.push({ file: b.file, error: `Extracto duplicado (${b.bankId}, período ${b.periodo ?? "?"}) — ignorado` })
      continue
    }
    grupos.set(key, { sessionId: crypto.randomUUID(), banco: b, label: b.ext.autoLabel })
  }
  for (const t of tangos) {
    // Unir al único grupo banco del mismo período; si hay 0 o varios, sesión propia.
    const candidatos = [...grupos.values()].filter(g => g.banco && g.banco.periodo === t.periodo && !g.tango)
    if (candidatos.length === 1) {
      candidatos[0].tango = t
    } else {
      grupos.set(`tango|${t.periodo ?? "?"}|${crypto.randomUUID()}`, {
        sessionId: crypto.randomUUID(), tango: t,
        label: `Mayor Tango — ${nombreMes(t.periodo)}`,
      })
    }
  }

  // 3. Persistir cada grupo y correr matching si tiene ambos lados
  const sesiones: { sessionId: string; label?: string; banco: boolean; tango: boolean; diferencia?: number }[] = []
  for (const g of grupos.values()) {
    try {
      if (g.banco) await persistBanco(g.sessionId, g.banco.ext)
      if (g.tango) await persistTango(g.sessionId, g.tango.mayor)

      let diferencia: number | undefined
      if (g.banco && g.tango) {
        const movs: Movimiento[] = g.banco.ext.movimientos.map(m => ({
          id: m.id, fecha: m.fecha, descripcion: m.descripcion, referencia: m.referencia,
          monto: m.monto, saldo: m.saldo, categoria: m.categoria as Movimiento["categoria"], grupoId: m.grupoId,
        }))
        const res = conciliar(movs, g.tango.mayor.asientos)
        // Matches+registro atómicos: un fallo no deja la conciliación a medias.
        await db.transaction(async (tx) => {
          await reemplazarMatchesYDiscrepancias(g.sessionId, res.matches, res.discrepancias, tx)
          await upsertConciliacion(g.sessionId, {
            stage: "done",
            movimientosCount: res.movimientos.length, asientosCount: res.asientos.length,
            saldoBanco: res.saldoBanco, saldoMayor: res.saldoMayor, diferencia: res.diferencia,
          }, orgId, tx)
        })
        diferencia = res.diferencia
      } else if (!g.banco && g.tango) {
        await upsertConciliacion(g.sessionId, { label: g.label }, orgId)
      }
      sesiones.push({ sessionId: g.sessionId, label: g.label, banco: !!g.banco, tango: !!g.tango, diferencia })
    } catch (err) {
      errores.push({ file: g.label ?? g.sessionId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ ok: true, sesiones, errores })
}
