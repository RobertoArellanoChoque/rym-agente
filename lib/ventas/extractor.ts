import { z } from "zod"
import { generateJSON } from "@/lib/ai/client"
import { pdfToMarkdown } from "@/lib/extractos/mistral-ocr"
import { extractFullText } from "@/lib/extractos/raw-text"

const RetencionSchema = z.object({
  tipo: z.string(),
  porcentaje: z.number().optional(),
  monto: z.number(), // centavos, siempre positivo
})

export const PagoSchema = z.object({
  empresa: z.string(),
  cuit: z.string().optional(),
  fechaPago: z.string(), // YYYY-MM-DD
  concepto: z.string().optional(),
  nroComprobante: z.string().optional(),
  montoBruto: z.number(), // centavos
  retenciones: z.array(RetencionSchema),
  montoNeto: z.number(), // centavos — lo acreditado
})

export type PagoResult = z.infer<typeof PagoSchema>

const SYSTEM_PROMPT = `Sos un contador argentino experto en liquidaciones de pago y comprobantes de retención impositiva.
Extraé del comprobante:
- empresa: razón social del pagador
- cuit: CUIT del pagador sin guiones (solo dígitos)
- fechaPago: fecha del pago, formato YYYY-MM-DD
- concepto: descripción del servicio/período pagado
- nroComprobante: número de orden de pago o comprobante
- montoBruto: importe bruto antes de retenciones, en centavos (× 100). Ej: $10.000,00 → 1000000
- retenciones: array de { tipo, porcentaje (si figura), monto en centavos positivo }
  Tipos comunes: Ganancias, IVA, IIBB, Seg. Social, SIRCREBs, SUSS, etc.
- montoNeto: importe neto acreditado tras retenciones, en centavos (× 100)
Todos los montos deben estar en centavos (valor monetario × 100, sin decimales).`

export async function procesarComprobantePago(buffer: ArrayBuffer, filename: string): Promise<{ markdown: string; result: PagoResult }> {
  const ext = filename.split(".").pop()?.toLowerCase()
  const markdown = ext === "pdf" ? await pdfToMarkdown(buffer) : await extractFullText(buffer, filename)
  const result = await generateJSON(
    `Analizá este comprobante de pago argentino y extraé todos los datos de retenciones impositivas:\n\n${markdown}`,
    PagoSchema,
    SYSTEM_PROMPT,
    "ventas"
  )
  return { markdown, result }
}
