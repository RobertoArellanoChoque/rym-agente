import { NextRequest, NextResponse } from "next/server"
import { pdfToMarkdown } from "@/lib/extractos/mistral-ocr"
import { extractRawText } from "@/lib/extractos/raw-text"
import { classifyText, type FileClassification } from "@/lib/orchestrator/classifier"
import { procesarExtractoTarjeta } from "@/lib/tarjetas/extractor"
import { procesarComprobantePago, type PagoResult } from "@/lib/ventas/extractor"
import { createSession } from "@/lib/sessions/manager"
import { MAX_UPLOAD_BYTES } from "@/lib/utils"
import { centavosAString } from "@/lib/conciliacion/matching"
import { db } from "@/lib/db"
import { resumenTarjetas, lineasTarjeta, retenciones } from "@/lib/db/schema"
import { toCentavos } from "@/lib/utils"
import crypto from "crypto"

interface OrchestratorResult {
  classification: FileClassification
  sessionId?: string
  summary: string
  nextStep?: string
  data?: unknown
}

function buildBancoSummary(bankName: string, sessionId: string): OrchestratorResult {
  return {
    classification: { type: "banco", confidence: "high", suggestedModule: "conciliacion", metadata: { bankName } },
    sessionId,
    summary: `Detecté extracto del ${bankName}. Sesión de conciliación creada (ID: ${sessionId.slice(0, 8)}…). Subí el archivo en el módulo **Conciliación Bancaria** para extraer los movimientos.`,
    nextStep: "Ir a Conciliación Bancaria y subir este extracto con la sesión activa.",
  }
}

function buildTangoSummary(sessionId?: string): OrchestratorResult {
  return {
    classification: { type: "tango", confidence: "high", suggestedModule: "conciliacion", metadata: {} },
    sessionId,
    summary: sessionId
      ? `Este parece ser el Mayor de Tango. Subilo en **Conciliación Bancaria** en la sesión activa (${sessionId.slice(0, 8)}…).`
      : `Este parece ser el Mayor de Tango. Primero subí el extracto bancario para crear una sesión, luego cargá este archivo.`,
    nextStep: "Ir a Conciliación Bancaria y subir el Mayor de Tango.",
  }
}

async function handleTarjeta(buffer: ArrayBuffer): Promise<OrchestratorResult> {
  const { result } = await procesarExtractoTarjeta(buffer)
  const now = new Date().toISOString()
  const resumenId = crypto.randomUUID()
  const totalMonto = result.lineas.reduce((acc, l) => acc + toCentavos(l.monto), 0)

  await db.insert(resumenTarjetas).values({
    id: resumenId,
    nombreTarjeta: result.nombreTarjeta,
    periodo: result.periodo,
    totalMonto,
    creadoEn: now,
  })

  if (result.lineas.length > 0) {
    await db.insert(lineasTarjeta).values(result.lineas.map(l => ({
      id: crypto.randomUUID(),
      resumenId,
      cuenta: l.cuenta,
      descripcion: l.descripcion,
      monto: toCentavos(l.monto),
      periodo: l.periodo || result.periodo,
      estado: l.monto > 0 ? "OK" : "",
    })))
  }

  return {
    classification: { type: "tarjeta", confidence: "high", suggestedModule: "proveedores", metadata: {} },
    summary: `Procesé resumen de **${result.nombreTarjeta}** — ${result.lineas.length} cargos, total ${centavosAString(totalMonto)}. Disponible en Proveedores.`,
    nextStep: "Podés ver el detalle completo en el módulo Proveedores.",
    data: { id: resumenId, nombreTarjeta: result.nombreTarjeta, periodo: result.periodo, totalMonto },
  }
}

async function handlePago(buffer: ArrayBuffer): Promise<OrchestratorResult> {
  const { result } = await procesarComprobantePago(buffer)
  const pago = result as PagoResult
  const totalRetenciones = pago.retenciones.reduce((s, r) => s + r.monto, 0)
  const tiposRet = pago.retenciones.map((r) => r.tipo).join(", ")

  const retencionId = crypto.randomUUID()
  await db.insert(retenciones).values({
    id: retencionId,
    empresa: pago.empresa,
    cuit: pago.cuit ?? "",
    fechaPago: pago.fechaPago,
    concepto: pago.concepto ?? "",
    nroComprobante: pago.nroComprobante ?? "",
    montoBruto: pago.montoBruto,
    montoNeto: pago.montoNeto,
    retencionesJson: pago.retenciones,
    creadoEn: new Date().toISOString(),
  })

  return {
    classification: { type: "pago_retencion", confidence: "high", suggestedModule: "ventas", metadata: {} },
    summary: `Comprobante de **${pago.empresa}** — Bruto: ${centavosAString(pago.montoBruto)}, Retenciones (${tiposRet}): ${centavosAString(totalRetenciones)}, Neto: ${centavosAString(pago.montoNeto)}.`,
    data: { id: retencionId, ...pago },
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const existingSessionId = form.get("sessionId") as string | null

    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 413 })
    }

    const filename = file.name.toLowerCase()
    const ext = filename.split(".").pop() ?? ""
    const isPdf = ext === "pdf"
    const isSpreadsheet = ["xlsx", "xls", "csv"].includes(ext)

    if (!isPdf && !isSpreadsheet) {
      return NextResponse.json({ error: "Formato no soportado. Usá PDF, Excel o CSV." }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()

    // Extract text for classification
    let classifyText_input: string
    let pdfMarkdown: string | null = null

    if (isPdf) {
      try {
        pdfMarkdown = await pdfToMarkdown(buffer)
        classifyText_input = pdfMarkdown.slice(0, 3000)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("MISTRAL_API_KEY_NOT_CONFIGURED")) {
          return NextResponse.json({ error: "Servicio de OCR no disponible." }, { status: 503 })
        }
        throw err
      }
    } else {
      // Excel/CSV: raw text extraction for classification (no OCR)
      classifyText_input = await extractRawText(buffer, file.name)
    }

    const classification = classifyText(classifyText_input)

    let result: OrchestratorResult

    switch (classification.type) {
      case "banco": {
        const sessionId = existingSessionId ?? await createSession(
          `Conciliación ${classification.metadata.bankName ?? "banco"} — ${new Date().toLocaleDateString("es-AR")}`
        )
        result = buildBancoSummary(classification.metadata.bankName ?? "banco desconocido", sessionId)
        break
      }

      case "tango": {
        result = buildTangoSummary(existingSessionId ?? undefined)
        break
      }

      case "tarjeta": {
        if (isPdf) {
          result = await handleTarjeta(buffer)
        } else {
          result = {
            classification,
            summary: "Detecté un resumen de tarjeta. Para Excel/CSV subilo directamente en el módulo **Proveedores**.",
            nextStep: "Ir a Proveedores y subir el archivo.",
          }
        }
        break
      }

      case "pago_retencion": {
        if (isPdf) {
          result = await handlePago(buffer)
        } else {
          result = {
            classification,
            summary: "Detecté un comprobante de pago. Para Excel/CSV subilo directamente en el módulo **Ventas**.",
            nextStep: "Ir a Ventas y subir el archivo.",
          }
        }
        break
      }

      default: {
        const hint = isSpreadsheet
          ? "Parece un Excel o CSV. Si es un extracto bancario o Mayor de Tango, subilo en **Conciliación Bancaria**."
          : "No pude identificar el tipo de archivo. ¿Podés decirme qué es este documento?"
        result = { classification, summary: hint }
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[orchestrator/upload]", err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("not configured")) {
      return NextResponse.json({ error: "Servicio de IA no disponible." }, { status: 503 })
    }
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 })
  }
}
