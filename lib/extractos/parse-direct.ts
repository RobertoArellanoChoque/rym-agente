import ExcelJS from "exceljs"
import crypto from "crypto"
import { detectColumns, parseArgAmount, parseDate } from "@/lib/tango/parser"
import type { Movimiento } from "@/lib/types"

export type DirectParseResult = {
  movimientos: Movimiento[]
  saldoFinal?: number
}

export async function parseExtractoBanco(buffer: ArrayBuffer): Promise<DirectParseResult> {
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.worksheets[0]

    const rows: ExcelJS.Row[] = []
    sheet.eachRow((row) => rows.push(row))

    if (rows.length < 2) return { movimientos: [] }

    const firstVals = rows[0].values as (string | number | null | undefined)[]
    const colMap = detectColumns(firstVals.slice(1))

    const movimientos: Movimiento[] = []
    let lastSaldo: number | undefined

    for (let i = 1; i < rows.length; i++) {
      const vals = rows[i].values as (string | number | Date | null | undefined)[]
      const get = (colIdx: number) => vals[colIdx + 1]

      const fecha = parseDate(get(colMap.fecha))
      const descripcion = String(get(colMap.descripcion) ?? "").trim()
      const referencia = String(get(colMap.referencia) ?? "").trim()

      let monto = 0
      if (colMap.debe !== null && colMap.haber !== null) {
        const haber = parseArgAmount(get(colMap.haber) as string | number)
        const debe = parseArgAmount(get(colMap.debe) as string | number)
        monto = haber - debe // bank: credit positive, debit negative
      } else if (colMap.monto !== null) {
        monto = parseArgAmount(get(colMap.monto) as string | number)
      }

      if (colMap.saldo !== null) {
        const s = parseArgAmount(get(colMap.saldo) as string | number)
        if (s !== 0) lastSaldo = s
      }

      if (!fecha || isNaN(monto)) continue
      if (!descripcion && monto === 0) continue

      movimientos.push({
        id: crypto.randomUUID(),
        fecha,
        descripcion,
        referencia,
        monto,
        ...(colMap.saldo !== null ? { saldo: parseArgAmount(get(colMap.saldo) as string | number) } : {}),
      })
    }

    return { movimientos, saldoFinal: lastSaldo }
  } catch {
    return { movimientos: [] }
  }
}
