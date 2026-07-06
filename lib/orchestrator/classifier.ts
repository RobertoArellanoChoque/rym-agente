import { detectBankByKeyword } from "@/lib/bancos/registry"

export type FileType = "banco" | "tango" | "pago_retencion" | "tarjeta" | "desconocido"

export interface FileClassification {
  type: FileType
  confidence: "high" | "low"
  suggestedModule: "conciliacion" | "ventas" | "proveedores" | null
  metadata: { bankId?: string; bankName?: string }
}

const TANGO_KEYWORDS = [
  "mayor de cuentas", "numero de asiento", "nro. asiento", "cuenta contable",
  "tango gestion", "plan de cuentas", "debe\thaber", "tango software",
]

const TARJETA_KEYWORDS = [
  "resumen de cuenta", "tarjeta de credito", "tarjeta visa", "tarjeta mastercard",
  "american express", "amex", "vencimiento de pago", "cuota",
  "resumen de tarjeta", "compra en cuotas",
]

const PAGO_KEYWORDS = [
  "constancia de retencion", "comprobante de retencion", "retencion de ganancias",
  "retencion de iva", "constancia de pago", "liquidacion de pago",
  "retencion impositiva", "sircreb", "arba", "agip",
]

export function classifyText(text: string): FileClassification {
  const lower = text.toLowerCase()

  // 1. Banco — more specific (has institution name)
  const bankConfig = detectBankByKeyword(text)
  if (bankConfig) {
    return {
      type: "banco",
      confidence: "high",
      suggestedModule: "conciliacion",
      metadata: { bankId: bankConfig.id, bankName: bankConfig.name },
    }
  }

  // 2. Tango GL
  const tangoScore = TANGO_KEYWORDS.filter((k) => lower.includes(k)).length
  if (tangoScore >= 1) {
    return { type: "tango", confidence: "high", suggestedModule: "conciliacion", metadata: {} }
  }

  // 3. Tarjeta de crédito
  const tarjetaScore = TARJETA_KEYWORDS.filter((k) => lower.includes(k)).length
  if (tarjetaScore >= 1) {
    return { type: "tarjeta", confidence: "high", suggestedModule: "proveedores", metadata: {} }
  }

  // 4. Comprobante de pago / retenciones
  const pagoScore = PAGO_KEYWORDS.filter((k) => lower.includes(k)).length
  if (pagoScore >= 1) {
    return { type: "pago_retencion", confidence: "high", suggestedModule: "ventas", metadata: {} }
  }

  return { type: "desconocido", confidence: "low", suggestedModule: null, metadata: {} }
}
