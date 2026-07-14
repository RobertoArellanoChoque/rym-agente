import { describe, it, expect } from "vitest"
import ExcelJS from "exceljs"
import { parseArcaXlsx } from "@/lib/contabilidad/parsers/arca"

async function buildWorkbook(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Sheet1")
  for (const row of rows) ws.addRow(row)
  const buf = await wb.xlsx.writeBuffer()
  return buf as unknown as ArrayBuffer
}

describe("parseArcaXlsx", () => {
  it("parsea jurisdicción y filas de un workbook mínimo", async () => {
    const buffer = await buildWorkbook([
      ["RG CABA - PERCEPCIONES"], // row 1: título usado para detectar jurisdicción
      ["CUIT", "FECHA", "TIPO", "LETRA", "N COMPROBANTE", "N COMPR ORIGEN", "IMPORTE"], // header
      ["20123456789", "15/01/2026", "202", "A", "1234", "5678", 1500.5],
      ["20987654321", "20/01/2026", "202", "A", "1235", "5679", 300],
    ])

    const { jurisdiccion, filas } = await parseArcaXlsx(buffer)

    expect(jurisdiccion).toBe("caba")
    expect(filas).toHaveLength(2)
    expect(filas[0]).toMatchObject({
      cuitAgente: "20123456789",
      fechaRetencion: "2026-01-15",
      tipo: "202",
      letra: "A",
      nroComprobante: "1234",
      nroComprOrigen: "5678",
      importe: 150050,
    })
    expect(filas[1].importe).toBe(30000)
  })
})
