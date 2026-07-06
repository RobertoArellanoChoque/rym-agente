import { NextRequest, NextResponse } from "next/server"
import path from "path"
import { promises as fs } from "fs"
import { z } from "zod"
import { sessionExists, getSessionDir } from "@/lib/sessions/manager"
import { extractRawText } from "@/lib/extractos/raw-text"
import { pdfToMarkdown } from "@/lib/extractos/mistral-ocr"
import { detectBankByKeyword } from "@/lib/bancos/registry"
import { ALL_CONFIGS } from "@/lib/bancos/configs"
import { generateJSON } from "@/lib/ai/client"
import { parseExtractoBanco } from "@/lib/extractos/parse-direct"
import { categorizarMovimiento } from "@/lib/extractos/categorize"
import { saldoFinalPorFecha } from "@/lib/extractos/saldo-final"
import { setSaldo } from "@/lib/saldos/manager"
import { upsertConciliacion } from "@/lib/conciliacion/registry"
import { db } from "@/lib/db"
import { movimientos as movimientosTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { BankDetectionResult } from "@/lib/types"
import { toCentavos, MAX_UPLOAD_BYTES } from "@/lib/utils"

const MovimientoSchema = z.object({
  fecha: z.string(),
  descripcion: z.string(),
  referencia: z.string().default(""),
  monto: z.number(),           // pesos, negativo=débito (el código convierte a centavos)
  saldo: z.number().optional(), // pesos
})

const MovimientosSchema = z.object({
  movimientos: z.array(MovimientoSchema),
  saldoAnterior: z.number().optional(), // pesos, "SALDO ANTERIOR" del extracto
  saldoFinal: z.number().optional(),    // pesos, "Saldo al X DE MES"
})

const BankDetectionSchema = z.object({
  bankId: z.string(),
  bankName: z.string(),
  confidence: z.enum(["high", "low"]),
})

const DETECT_CHARS = 2000

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
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })
  }
  if (!(await sessionExists(sessionId))) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
  }

  const filename = file.name.toLowerCase()
  const ext = filename.split(".").pop()
  if (!["pdf", "xlsx", "xls"].includes(ext ?? "")) {
    return NextResponse.json(
      { error: "Formato no soportado. Subí PDF o Excel." },
      { status: 400 }
    )
  }

  const buffer = await file.arrayBuffer()
  const sessionDir = getSessionDir(sessionId)

  // ── BRANCH: PDF → Mistral OCR + AI, Excel → fast direct parse (AI fallback) ──
  let movimientos: z.infer<typeof MovimientoSchema>[] = []
  let saldoFinalAI: number | undefined
  let saldoAnteriorAI: number | undefined
  let bankConfig = null as typeof ALL_CONFIGS[0] | null
  let bankResult: BankDetectionResult

  if (ext === "pdf") {
    let markdown: string
    try {
      markdown = await pdfToMarkdown(buffer)
    } catch (err) {
      console.error("[banco/route] PDF OCR error:", err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("MISTRAL_API_KEY_NOT_CONFIGURED")) {
        return NextResponse.json(
          { error: "Servicio de OCR no disponible.", ocrRequired: true },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: "Error procesando el PDF con OCR" }, { status: 400 })
    }
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(path.join(sessionDir, "extracto.md"), markdown, "utf8")

    const detectionText = markdown.slice(0, DETECT_CHARS)
    const detected = detectBankByKeyword(detectionText)
    if (detected) {
      bankConfig = detected
      bankResult = { bankId: detected.id, bankName: detected.name, confidence: "high" }
    } else {
      try {
        bankResult = await generateJSON(
          `Identificá a qué banco argentino pertenece este extracto. bankId en minúsculas.\n\n${detectionText}`,
          BankDetectionSchema,
          "Sos un experto en extractos bancarios argentinos.",
          "deteccion-banco"
        )
        bankConfig = ALL_CONFIGS.find((c) => c.id === bankResult.bankId) ?? null
      } catch (err) {
        console.error("[banco/route] Bank detection error:", err)
        bankResult = { bankId: "unknown", bankName: "Banco desconocido", confidence: "low" }
      }
    }

    const systemPrompt = bankConfig?.extractionSystemPrompt ??
      `Sos un extractor de datos bancarios. Extraé todos los movimientos. Débitos negativos, créditos positivos. Fechas a YYYY-MM-DD. Devolvé montos en pesos exactamente como aparecen en el extracto (NO multipliques por 100).`
    try {
      const result = await generateJSON(
        `Extraé todos los movimientos bancarios del siguiente extracto:\n\n${markdown}`,
        MovimientosSchema,
        systemPrompt,
        "extracto"
      )
      movimientos = result.movimientos.map(m => ({
        ...m,
        monto: toCentavos(m.monto),
        saldo: m.saldo != null ? toCentavos(m.saldo) : undefined,
      }))
      saldoFinalAI = result.saldoFinal != null ? toCentavos(result.saldoFinal) : undefined
      saldoAnteriorAI = result.saldoAnterior != null ? toCentavos(result.saldoAnterior) : undefined
    } catch (err) {
      console.error("[banco/route] AI extraction error:", err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("not configured")) {
        return NextResponse.json(
          { error: "Servicio de IA no disponible.", aiRequired: true },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: "Error extrayendo movimientos con IA" }, { status: 500 })
    }
  } else {
    // Excel: try fast direct parse first, fall back to AI
    let usedDirectParse = false
    try {
      const directResult = await parseExtractoBanco(buffer)
      if (directResult.movimientos.length >= 3) {
        movimientos = directResult.movimientos
        saldoFinalAI = directResult.saldoFinal
        usedDirectParse = true
      }
    } catch {
      // silent — fall through to AI
    }

    // Bank detection from raw text (fast, keyword-based)
    let rawText = ""
    try {
      rawText = await extractRawText(buffer, filename)
    } catch (err) {
      console.error("[banco/route] Excel/raw text error:", err)
      if (!usedDirectParse) return NextResponse.json({ error: "Error leyendo el archivo" }, { status: 400 })
    }
    const detected = detectBankByKeyword(rawText)
    if (detected) {
      bankConfig = detected
      bankResult = { bankId: detected.id, bankName: detected.name, confidence: "high" }
    } else {
      bankResult = { bankId: "unknown", bankName: "Banco desconocido", confidence: "low" }
    }

    if (!usedDirectParse) {
      // AI fallback for movimiento extraction
      const systemPrompt = bankConfig?.extractionSystemPrompt ??
        `Sos un extractor de datos bancarios. Extraé todos los movimientos. Débitos negativos, créditos positivos. Fechas a YYYY-MM-DD. Devolvé montos en pesos exactamente como aparecen en el extracto (NO multipliques por 100).`
      try {
        const result = await generateJSON(
          `Extraé todos los movimientos bancarios del siguiente extracto:\n\n${rawText}`,
          MovimientosSchema,
          systemPrompt,
          "extracto"
        )
        movimientos = result.movimientos.map(m => ({
          ...m,
          monto: toCentavos(m.monto),
          saldo: m.saldo != null ? toCentavos(m.saldo) : undefined,
        }))
        saldoFinalAI = result.saldoFinal != null ? toCentavos(result.saldoFinal) : undefined
        saldoAnteriorAI = result.saldoAnterior != null ? toCentavos(result.saldoAnterior) : undefined
      } catch (err) {
        console.error("[banco/route] AI extraction error:", err)
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("not configured")) {
          return NextResponse.json(
            { error: "Servicio de IA no disponible.", aiRequired: true },
            { status: 503 }
          )
        }
        return NextResponse.json({ error: "Error extrayendo movimientos con IA" }, { status: 500 })
      }
    }
  }

  // ── Persist results ──────────────────────────────────────────────────────
  const { randomUUID } = await import("crypto")
  const movimientosConId = movimientos
    .filter((m) => m.fecha && !isNaN(m.monto) && m.monto !== 0)
    .map((m) => ({ ...m, id: randomUUID(), referencia: m.referencia ?? "", categoria: categorizarMovimiento(m.descripcion) }))

  // saldoFinal robusto al orden de las filas: Patagonia lista más reciente
  // primero, así que el saldo de cierre no es la última fila sino la más reciente.
  const saldoFinal = saldoFinalPorFecha(movimientosConId, saldoFinalAI)

  // Replace existing movimientos atomically (re-upload scenario)
  await db.transaction(async (tx) => {
    await tx.delete(movimientosTable).where(eq(movimientosTable.conciliacionId, sessionId))
    if (movimientosConId.length > 0) {
      await tx.insert(movimientosTable).values(movimientosConId.map(m => ({
        id: m.id,
        conciliacionId: sessionId,
        fecha: m.fecha,
        descripcion: m.descripcion,
        referencia: m.referencia,
        monto: m.monto,
        saldo: m.saldo ?? null,
        categoria: m.categoria ?? null,
      })))
    }
  })

  // Auto-update último saldo por banco
  if (bankResult.bankId !== "unknown" && movimientosConId.length > 0) {
    const sorted = [...movimientosConId].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const ultimo = sorted[sorted.length - 1]
    const ultimoSaldo = saldoFinal ?? ultimo.saldo ?? movimientosConId.reduce((s, m) => s + m.monto, 0)
    try {
      await setSaldo(bankResult.bankId, {
        bankName: bankResult.bankName,
        ultimoSaldo,
        ultimaFecha: ultimo.fecha,
        updatedAt: new Date().toISOString(),
        updatedBy: "auto",
      })
    } catch (err) {
      console.error("[banco/route] setSaldo error:", err)
    }
  }

  // Auto-rename session label to "[Banco] — [Mes Año]" after bank detection
  const mesAno = new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" })
  const autoLabel = bankResult.bankId !== "unknown"
    ? `${bankResult.bankName} — ${mesAno.charAt(0).toUpperCase() + mesAno.slice(1)}`
    : undefined

  await upsertConciliacion(sessionId, {
    stage: "banco-done",
    bankId: bankResult.bankId,
    bankName: bankResult.bankName,
    confidence: bankResult.confidence,
    saldoAnterior: saldoAnteriorAI,
    saldoFinal,
    movimientosCount: movimientosConId.length,
    ...(autoLabel && { label: autoLabel }),
  })

  return NextResponse.json({
    sessionId,
    bank: bankResult,
    movimientos: movimientosConId,
    total: movimientosConId.length,
    saldoAnterior: saldoAnteriorAI,
    saldoFinal,
    ...(autoLabel && { label: autoLabel }),
  })
}
