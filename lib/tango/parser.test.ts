import { describe, it, expect } from "vitest"
import ExcelJS from "exceljs"
import { parseTangoExcel, parseTangoCsv } from "@/lib/tango/parser"

describe("parseTangoExcel", () => {
  it("detecta columnas por header y parsea un asiento debe/haber", async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Sheet1")
    ws.addRow(["FECHA", "LEYENDA", "N_COMP", "DEBE", "HABER", "CUENTA", "SALDO"])
    ws.addRow(["15/01/2026", "PAGO PROVEEDOR", "F001", "1500,50", "0,00", "PROVEEDORES", "5000,00"])
    ws.addRow(["16/01/2026", "COBRO CLIENTE", "F002", "0,00", "800,00", "CLIENTES", "4200,00"])
    const buf = await wb.xlsx.writeBuffer()

    const asientos = await parseTangoExcel(buf as unknown as ArrayBuffer)

    expect(asientos).toHaveLength(2)
    expect(asientos[0]).toMatchObject({
      fecha: "2026-01-15",
      descripcion: "PAGO PROVEEDOR",
      referencia: "F001",
      cuenta: "PROVEEDORES",
      monto: 150050,
    })
    expect(asientos[1]).toMatchObject({ fecha: "2026-01-16", monto: -80000 })
  })
})

describe("parseTangoCsv", () => {
  it("parsea un CSV mínimo con el mismo layout debe/haber", async () => {
    const csv = [
      "FECHA,LEYENDA,N_COMP,DEBE,HABER,CUENTA,SALDO",
      "15/01/2026,PAGO PROVEEDOR,F001,1500.50,0.00,PROVEEDORES,5000.00",
      "16/01/2026,COBRO CLIENTE,F002,0.00,800.00,CLIENTES,4200.00",
    ].join("\n")
    const buffer = new TextEncoder().encode(csv).buffer

    const asientos = await parseTangoCsv(buffer)

    expect(asientos).toHaveLength(2)
    expect(asientos[0]).toMatchObject({
      fecha: "2026-01-15",
      descripcion: "PAGO PROVEEDOR",
      referencia: "F001",
      cuenta: "PROVEEDORES",
      monto: 150050,
    })
    expect(asientos[1]).toMatchObject({ fecha: "2026-01-16", monto: -80000 })
  })
})
