import { z } from "zod"
import { generateJSON } from "@/lib/ai/client"
import { pdfToMarkdown } from "@/lib/extractos/mistral-ocr"
import { extractFullText } from "@/lib/extractos/raw-text"

export const TARJETA_SYSTEM_PROMPT = `Sos un contador argentino experto en extractos de tarjetas de crédito.

El input es texto de un resumen de tarjeta de crédito (OCR de un PDF, o contenido de una planilla Excel/CSV/Google Sheets).

OBJETIVO: Extraé ÚNICAMENTE las líneas de naturaleza impositiva. Ignorá compras, consumos y servicios comerciales.

LÍNEAS A EXTRAER (tipoLinea = "impuesto"):
- IVA (cualquier alícuota: 21%, 10.5%, 27%)
- IIBB / Ingresos Brutos (percepciones, retenciones)
- Percepciones impositivas (nacionales, provinciales, municipales)
- Retenciones (Ganancias, IVA, IIBB, SUSS, SIRCREBs)
- Tasas, contribuciones, impuestos a los débitos/créditos bancarios
- Impuesto PAIS, impuesto al cheque, sellados

LÍNEAS A EXTRAER (tipoLinea = "devolucion"):
- Devoluciones, reintegros o créditos de conceptos impositivos
- Acreditaciones por percepciones en exceso

IGNORAR COMPLETAMENTE:
- Compras en comercios, restaurantes, supermercados, etc.
- Servicios (Netflix, Spotify, seguros, cuotas, etc.)
- Intereses, financiación, cargos de renovación de tarjeta
- Cualquier cargo comercial que no sea de naturaleza impositiva

FORMATO DE NÚMEROS (formato argentino):
- Punto como separador de miles, coma como decimal: 1.234,56 → 1234.56
- Devolvé el valor en pesos decimal (ej: 1234.56), NO multipliques por 100.
- Los impuestos son positivos. Las devoluciones impositivas también positivas (ya están clasificadas como "devolucion").

CAMPOS A DEVOLVER:
- nombreTarjeta: nombre de la tarjeta tal como aparece (ej: "Visa Galicia", "American Express", "Mastercard Comafi")
- periodo: período del resumen (ej: "31/03/26 AL 28/04/26")
- lineas: solo las líneas impositivas, con cuenta, descripcion, monto, periodo, tipoLinea`

const LineaSchema = z.object({
  cuenta: z.string().default(""),
  descripcion: z.string(),
  monto: z.number(),
  periodo: z.string().default(""),
  tipoLinea: z.enum(["impuesto", "devolucion"]).default("impuesto"),
})

export const TarjetaResultSchema = z.object({
  nombreTarjeta: z.string(),
  periodo: z.string().default(""),
  lineas: z.array(LineaSchema),
})

export type TarjetaResult = z.infer<typeof TarjetaResultSchema>
export type LineaTarjeta = z.infer<typeof LineaSchema>

export async function procesarExtractoTarjeta(buffer: ArrayBuffer, filename: string): Promise<{
  markdown: string
  result: TarjetaResult
}> {
  const ext = filename.split(".").pop()?.toLowerCase()
  const markdown = ext === "pdf" ? await pdfToMarkdown(buffer) : await extractFullText(buffer, filename)
  const result = await generateJSON(markdown, TarjetaResultSchema, TARJETA_SYSTEM_PROMPT, "tarjetas")
  return { markdown, result }
}
