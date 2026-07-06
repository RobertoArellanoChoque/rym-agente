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

export interface FilaTango {
  codCta: string
  descCta: string
  fecha: string
  codComp: string
  nComp: string
  debe: number
  haber: number
  saldo: number
}

export async function parseTangoXlsx(buffer: ArrayBuffer): Promise<{ filas: FilaTango[] }> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return { filas: [] }

  const filas: FilaTango[] = []

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return // skip headers
    const vals = row.values as unknown[]

    // COD_CTA=1, DESC_CTA=2, COD_MONEDA=3, SIGLA=4, DESC_MONE=5, FECHA=6, COD_COMP=7, N_COMP=8, BARRA=9, LEYENDA=10, DEBE=11, HABER=12, SALDO=13
    const codCta = String(vals[1] ?? "").trim()
    if (!codCta) return

    const fecha = parseDate(vals[6])
    if (!fecha) return

    filas.push({
      codCta,
      descCta: String(vals[2] ?? "").trim(),
      fecha,
      codComp: String(vals[7] ?? "").trim(),
      nComp: String(vals[8] ?? "").trim(),
      debe: parseMonto(vals[11]),
      haber: parseMonto(vals[12]),
      saldo: parseMonto(vals[13]),
    })
  })

  return { filas }
}
