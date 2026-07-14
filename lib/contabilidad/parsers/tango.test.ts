import { describe, it, expect } from "vitest"
import ExcelJS from "exceljs"
import { parseTangoXlsx } from "@/lib/contabilidad/parsers/tango"

async function buildWorkbook(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Sheet1")
  for (const row of rows) ws.addRow(row)
  const buf = await wb.xlsx.writeBuffer()
  return buf as unknown as ArrayBuffer
}

describe("parseTangoXlsx", () => {
  it("parsea filas de un mayor Tango mínimo (primera fila = headers, se saltea)", async () => {
    const buffer = await buildWorkbook([
      ["COD_CTA", "DESC_CTA", "COD_MONEDA", "SIGLA", "DESC_MONE", "FECHA", "COD_COMP", "N_COMP", "BARRA", "LEYENDA", "DEBE", "HABER", "SALDO"],
      ["100", "CAJA", "001", "$", "PESOS", "15/01/2026", "AJU", "X0001", "0", "AJUSTE", "1000,00", "0,00", "1000,00"],
      ["100", "CAJA", "001", "$", "PESOS", "16/01/2026", "AJU", "X0002", "0", "PAGO", "0,00", "250,00", "750,00"],
    ])

    const { filas } = await parseTangoXlsx(buffer)

    expect(filas).toHaveLength(2)
    expect(filas[0]).toMatchObject({
      codCta: "100",
      descCta: "CAJA",
      fecha: "2026-01-15",
      codComp: "AJU",
      nComp: "X0001",
      debe: 100000,
      haber: 0,
      saldo: 100000,
    })
    expect(filas[1]).toMatchObject({ fecha: "2026-01-16", debe: 0, haber: 25000, saldo: 75000 })
  })
})
