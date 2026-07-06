import ExcelJS from "exceljs"

const DETECT_CHARS = 1000

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
    const lines: string[] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 20) return // only first 20 rows for detection
      const cells = (row.values as (string | number | Date | null | undefined)[])
        .slice(1)
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
      if (cells.length) lines.push(cells.join("\t"))
    })
    return lines.join("\n").slice(0, DETECT_CHARS)
  }

  if (ext === "csv") {
    const text = Buffer.from(buffer).toString("utf8")
    return text.split("\n").slice(0, 30).join("\n").slice(0, DETECT_CHARS)
  }

  throw new Error(`Formato no soportado: ${ext}`)
}
