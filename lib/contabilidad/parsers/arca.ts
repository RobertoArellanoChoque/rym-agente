function parseMonto(val: unknown): number {
  if (typeof val === "number") return Math.round(val * 100)
  if (typeof val === "string") {
    const cleaned = val.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : Math.round(num * 100)
  }
  return 0
}

function parseDate(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === "string") {
    const match = val.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
    if (match) return `${match[3]}-${match[2]}-${match[1]}`
  }
  return ""
}

type Jurisdiccion = "nacional" | "caba" | "otra"

function detectJurisdiccion(title: string): Jurisdiccion {
  const t = title.toLowerCase()
  if (t.includes("901") || t.includes("caba") || t.includes("ciudad autónoma") || t.includes("ciudad autonoma")) return "caba"
  if (t.includes("nacional") || t.includes("nación") || t.includes("nacion")) return "nacional"
  return "otra"
}

export interface FilaArca {
  cuitAgente: string
  fechaRetencion: string
  tipo: string
  letra: string
  nroComprobante: string
  nroComprOrigen: string
  importe: number
}

export async function parseArcaXlsx(buffer: ArrayBuffer): Promise<{ jurisdiccion: Jurisdiccion; filas: FilaArca[] }> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return { jurisdiccion: "otra", filas: [] }

  let jurisdiccion: Jurisdiccion = "otra"
  let headerRow = -1
  const filas: FilaArca[] = []

  ws.eachRow((row, rowNum) => {
    const vals = row.values as unknown[]

    // Row 1: detect title for jurisdiction
    if (rowNum === 1) {
      const title = String(vals[1] ?? "")
      jurisdiccion = detectJurisdiccion(title)
      return
    }

    // Find header row (has "CUIT" in first cell)
    if (headerRow === -1) {
      const first = String(vals[1] ?? "").toLowerCase()
      if (first.includes("cuit")) {
        headerRow = rowNum
      }
      return
    }

    // Data rows
    const cuit = String(vals[1] ?? "").trim()
    if (!cuit || cuit.toLowerCase().includes("cuit")) return // skip empty or duplicate headers

    const fecha = parseDate(vals[2])
    const tipo = String(vals[3] ?? "").trim()
    const letra = String(vals[4] ?? "").trim()
    const nroComp = String(vals[5] ?? "").trim()
    const nroOrigen = String(vals[6] ?? "").trim()
    const importe = parseMonto(vals[7])

    if (!fecha || importe === 0) return

    filas.push({ cuitAgente: cuit, fechaRetencion: fecha, tipo, letra, nroComprobante: nroComp, nroComprOrigen: nroOrigen, importe })
  })

  return { jurisdiccion, filas }
}
