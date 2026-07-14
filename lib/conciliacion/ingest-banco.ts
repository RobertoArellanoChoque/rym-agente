import path from "path"
import { promises as fs } from "fs"
import { z } from "zod"
import { getSessionDir } from "@/lib/sessions/manager"
import { extractRawText } from "@/lib/extractos/raw-text"
import { pdfToMarkdown } from "@/lib/extractos/mistral-ocr"
import { detectBankByKeyword } from "@/lib/bancos/registry"
import { ALL_CONFIGS } from "@/lib/bancos/configs"
import { generateJSON } from "@/lib/ai/client"
import { parseExtractoBanco } from "@/lib/extractos/parse-direct"
import { categorizarMovimiento } from "@/lib/extractos/categorize"
import { repararConCadenaDeSaldos } from "@/lib/extractos/saldo-chain"
import { tagGruposPrestamo } from "@/lib/extractos/prestamos"
import { saldoFinalPorFecha } from "@/lib/extractos/saldo-final"
import { setSaldo } from "@/lib/saldos/manager"
import { upsertConciliacion } from "@/lib/conciliacion/registry"
import { periodoDeFechas, nombreMes } from "@/lib/conciliacion/periodo"
import { db } from "@/lib/db"
import { movimientos as movimientosTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { BankDetectionResult, Categoria } from "@/lib/types"
import { toCentavos } from "@/lib/utils"

const MovimientoSchema = z.object({
  fecha: z.string(),
  descripcion: z.string(),
  referencia: z.string().default(""),
  monto: z.number(),
  saldo: z.number().optional(),
})
const MovimientosSchema = z.object({
  movimientos: z.array(MovimientoSchema),
  saldoAnterior: z.number().optional(),
  saldoFinal: z.number().optional(),
})
const BankDetectionSchema = z.object({
  bankId: z.string(),
  bankName: z.string(),
  confidence: z.enum(["high", "low"]),
})

const DETECT_CHARS = 2000

// Error tipado para que la ruta mapee a HTTP. code ∈ OCR_UNAVAILABLE | OCR_FAILED | AI_UNAVAILABLE | AI_FAILED | READ_FAILED | UNSUPPORTED_FORMAT
export class IngestBancoError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); this.name = "IngestBancoError" }
}

type MovimientoConId = {
  id: string; fecha: string; descripcion: string; referencia: string
  monto: number; saldo?: number; categoria?: Categoria; grupoId?: string
}

export type ExtractoBanco = {
  bankResult: BankDetectionResult
  markdown?: string // solo PDF, para persistir extracto.md
  movimientos: MovimientoConId[]
  saldoAnterior?: number
  saldoFinal?: number
  periodo?: string
  autoLabel?: string
  cadena: { correcciones: unknown; inconsistencias: unknown; residual: unknown }
}

const DEFAULT_SYSTEM =
  `Sos un extractor de datos bancarios. Extraé todos los movimientos. Débitos negativos, créditos positivos. Fechas a YYYY-MM-DD. Devolvé montos en pesos exactamente como aparecen en el extracto (NO multipliques por 100).`

/** Extrae y normaliza un extracto bancario SIN tocar la DB ni requerir sesión. */
export async function extraerBanco(buffer: ArrayBuffer, filename: string): Promise<ExtractoBanco> {
  const lower = filename.toLowerCase()
  const ext = lower.split(".").pop()
  if (!["pdf", "xlsx", "xls"].includes(ext ?? "")) throw new IngestBancoError("UNSUPPORTED_FORMAT")

  let movimientos: z.infer<typeof MovimientoSchema>[] = []
  let saldoFinalAI: number | undefined
  let saldoAnteriorAI: number | undefined
  let bankConfig = null as typeof ALL_CONFIGS[0] | null
  let bankResult: BankDetectionResult
  let markdown: string | undefined

  if (ext === "pdf") {
    try {
      markdown = await pdfToMarkdown(buffer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("MISTRAL_API_KEY_NOT_CONFIGURED")) throw new IngestBancoError("OCR_UNAVAILABLE")
      console.error("[ingest-banco] OCR error:", err)
      throw new IngestBancoError("OCR_FAILED")
    }
    const detectionText = markdown.slice(0, DETECT_CHARS)
    const detected = detectBankByKeyword(detectionText)
    if (detected) {
      bankConfig = detected
      bankResult = { bankId: detected.id, bankName: detected.name, confidence: "high" }
    } else {
      try {
        bankResult = await generateJSON(
          `Identificá a qué banco argentino pertenece este extracto. bankId en minúsculas.\n\n${detectionText}`,
          BankDetectionSchema, "Sos un experto en extractos bancarios argentinos.", "deteccion-banco")
        bankConfig = ALL_CONFIGS.find((c) => c.id === bankResult.bankId) ?? null
      } catch {
        bankResult = { bankId: "unknown", bankName: "Banco desconocido", confidence: "low" }
      }
    }
    try {
      const result = await generateJSON(
        `Extraé todos los movimientos bancarios del siguiente extracto:\n\n${markdown}`,
        MovimientosSchema, bankConfig?.extractionSystemPrompt ?? DEFAULT_SYSTEM, "extracto")
      movimientos = result.movimientos.map(m => ({ ...m, monto: toCentavos(m.monto), saldo: m.saldo != null ? toCentavos(m.saldo) : undefined }))
      saldoFinalAI = result.saldoFinal != null ? toCentavos(result.saldoFinal) : undefined
      saldoAnteriorAI = result.saldoAnterior != null ? toCentavos(result.saldoAnterior) : undefined
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("not configured")) throw new IngestBancoError("AI_UNAVAILABLE")
      throw new IngestBancoError("AI_FAILED")
    }
  } else {
    let usedDirectParse = false
    try {
      const directResult = await parseExtractoBanco(buffer)
      if (directResult.movimientos.length >= 3) {
        movimientos = directResult.movimientos
        saldoFinalAI = directResult.saldoFinal
        usedDirectParse = true
      }
    } catch { /* fall through to AI */ }

    let rawText = ""
    try {
      rawText = await extractRawText(buffer, filename)
    } catch {
      if (!usedDirectParse) throw new IngestBancoError("READ_FAILED")
    }
    const detected = detectBankByKeyword(rawText)
    if (detected) {
      bankConfig = detected
      bankResult = { bankId: detected.id, bankName: detected.name, confidence: "high" }
    } else {
      bankResult = { bankId: "unknown", bankName: "Banco desconocido", confidence: "low" }
    }

    if (!usedDirectParse) {
      try {
        const result = await generateJSON(
          `Extraé todos los movimientos bancarios del siguiente extracto:\n\n${rawText}`,
          MovimientosSchema, bankConfig?.extractionSystemPrompt ?? DEFAULT_SYSTEM, "extracto")
        movimientos = result.movimientos.map(m => ({ ...m, monto: toCentavos(m.monto), saldo: m.saldo != null ? toCentavos(m.saldo) : undefined }))
        saldoFinalAI = result.saldoFinal != null ? toCentavos(result.saldoFinal) : undefined
        saldoAnteriorAI = result.saldoAnterior != null ? toCentavos(result.saldoAnterior) : undefined
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("not configured")) throw new IngestBancoError("AI_UNAVAILABLE")
        throw new IngestBancoError("AI_FAILED")
      }
    }
  }

  const { randomUUID } = await import("crypto")
  const esFilaSaldo = (desc: string) =>
    /^\s*saldo\s+(anterior|inicial|final|al\b)/i.test(desc.normalize("NFD").replace(/[̀-ͯ]/g, ""))
  const movimientosCrudos = movimientos
    .filter((m) => m.fecha && !isNaN(m.monto) && m.monto !== 0 && !esFilaSaldo(m.descripcion))
    .map((m) => ({ ...m, id: randomUUID(), referencia: m.referencia ?? "", categoria: categorizarMovimiento(m.descripcion) }))

  const cadena = repararConCadenaDeSaldos(movimientosCrudos, saldoAnteriorAI, saldoFinalAI)
  const movimientosConId = tagGruposPrestamo(cadena.movimientos) as MovimientoConId[]
  const saldoFinal = saldoFinalPorFecha(movimientosConId, saldoFinalAI)
  const periodo = periodoDeFechas(movimientosConId.map(m => m.fecha))

  const autoLabel = bankResult.bankId !== "unknown"
    ? `${bankResult.bankName} — ${periodo ? nombreMes(periodo) : "sin fecha"}`
    : undefined

  return {
    bankResult, markdown, movimientos: movimientosConId,
    saldoAnterior: saldoAnteriorAI, saldoFinal, periodo, autoLabel,
    cadena: { correcciones: cadena.correcciones, inconsistencias: cadena.inconsistencias, residual: cadena.residual },
  }
}

/** Persiste un extracto extraído en una sesión existente. */
export async function persistBanco(sessionId: string, ext: ExtractoBanco): Promise<void> {
  if (ext.markdown) {
    const sessionDir = getSessionDir(sessionId)
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(path.join(sessionDir, "extracto.md"), ext.markdown, "utf8")
  }

  await db.transaction(async (tx) => {
    await tx.delete(movimientosTable).where(eq(movimientosTable.conciliacionId, sessionId))
    if (ext.movimientos.length > 0) {
      await tx.insert(movimientosTable).values(ext.movimientos.map(m => ({
        id: m.id, conciliacionId: sessionId, fecha: m.fecha, descripcion: m.descripcion,
        referencia: m.referencia, monto: m.monto, saldo: m.saldo ?? null,
        categoria: m.categoria ?? null, grupoId: m.grupoId ?? null,
      })))
    }
  })

  if (ext.bankResult.bankId !== "unknown" && ext.movimientos.length > 0) {
    const sorted = [...ext.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const ultimo = sorted[sorted.length - 1]
    const ultimoSaldo = ext.saldoFinal ?? ultimo.saldo ?? ext.movimientos.reduce((s, m) => s + m.monto, 0)
    try {
      await setSaldo(ext.bankResult.bankId, {
        bankName: ext.bankResult.bankName, ultimoSaldo, ultimaFecha: ultimo.fecha,
        updatedAt: new Date().toISOString(), updatedBy: "auto",
      })
    } catch (err) { console.error("[persistBanco] setSaldo error:", err) }
  }

  await upsertConciliacion(sessionId, {
    stage: "banco-done",
    bankId: ext.bankResult.bankId, bankName: ext.bankResult.bankName, confidence: ext.bankResult.confidence,
    periodo: ext.periodo, saldoAnterior: ext.saldoAnterior, saldoFinal: ext.saldoFinal,
    movimientosCount: ext.movimientos.length,
    ...(ext.autoLabel && { label: ext.autoLabel }),
  })
}
