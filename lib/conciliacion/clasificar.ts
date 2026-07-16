import { extractRawText } from "@/lib/extractos/raw-text"
import { classifyText } from "@/lib/orchestrator/classifier"

// Decide banco vs tango sin doble-OCR: pdf→banco, csv→tango, xlsx→peek texto.
export async function clasificar(buffer: ArrayBuffer, filename: string): Promise<"banco" | "tango" | "desconocido"> {
  const ext = filename.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return "banco"
  if (ext === "csv") return "tango"
  if (ext === "xlsx" || ext === "xls") {
    try {
      const raw = await extractRawText(buffer, filename)
      const c = await classifyText(raw)
      if (c.type === "tango") return "tango"
      if (c.type === "banco") return "banco"
      return /debe|haber|asiento|mayor de cuentas/i.test(raw) ? "tango" : "banco"
    } catch { return "desconocido" }
  }
  return "desconocido"
}
