import ExcelJS from "exceljs"

const DETECT_CHARS = 1000

function sheetToLines(sheet: ExcelJS.Worksheet, maxRows?: number): string[] {
  const lines: string[] = []
  sheet.eachRow((row, rowNumber) => {
    if (maxRows && rowNumber > maxRows) return
    const cells = (row.values as (string | number | Date | null | undefined)[])
      .slice(1)
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
    if (cells.length) lines.push(cells.join("\t"))
  })
  return lines
}

export async function extractRawText(
  buffer: ArrayBuffer,
  filename: string
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase()

  if (ext === "pdf") {
    const { extractText } = await import("unpdf")
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
    return text.slice(0, DETECT_CHARS)
  }

  if (ext === "xlsx" || ext === "xls") {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.worksheets[0]
    return sheetToLines(sheet, 20).join("\n").slice(0, DETECT_CHARS) // solo primeras 20 filas, alcanza para clasificar
  }

  if (ext === "csv") {
    const text = Buffer.from(buffer).toString("utf8")
    return text.split("\n").slice(0, 30).join("\n").slice(0, DETECT_CHARS)
  }

  throw new Error(`Formato no soportado: ${ext}`)
}

// Sin truncar (a diferencia de extractRawText, pensada solo para clasificación) — para
// extracción real vía LLM (mismo rol que pdfToMarkdown en el flujo de PDFs).
export async function extractFullText(buffer: ArrayBuffer, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase()

  if (ext === "xlsx" || ext === "xls") {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.worksheets[0]
    return sheetToLines(sheet).join("\n")
  }

  if (ext === "csv") {
    return Buffer.from(buffer).toString("utf8")
  }

  throw new Error(`Formato no soportado: ${ext}`)
}
