import ExcelJS from "exceljs"
import crypto from "crypto"
import type { Asiento } from "@/lib/types"

// Standard column layout written/read by asientosToExcel / excelToAsientos:
// A: id | B: fecha (YYYY-MM-DD) | C: descripcion | D: referencia | E: monto (centavos) | F: cuenta

type ColMap = {
  fecha: number
  descripcion: number
  referencia: number
  debe: number | null
  haber: number | null
  monto: number | null
  cuenta: number
  saldo: number | null
}

export function detectColumns(headerRow: (string | number | null | undefined)[]): ColMap {
  const headers = headerRow.map((h) =>
    String(h ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
  )

  const find = (...keywords: string[]): number => {
    for (const kw of keywords) {
      const idx = headers.findIndex((h) => h.includes(kw))
      if (idx >= 0) return idx
    }
    return -1
  }

  const fecha = find("fecha")
  const descripcion = find("descripcion", "concepto", "detalle", "glosa", "leyenda")
  const referencia = find("n_comp", "referencia", "comprobante", "numero", "nro")
  const debe = find("debe", "debito", "egreso", "cargo")
  const haber = find("haber", "credito", "ingreso", "abono")
  const monto = find("monto", "importe", "total")
  const cuenta = find("cuenta")
  const saldo = find("saldo")

  // Fallback to positional if detection fails
  return {
    fecha: fecha >= 0 ? fecha : 0,
    descripcion: descripcion >= 0 ? descripcion : 1,
    referencia: referencia >= 0 ? referencia : 2,
    debe: debe >= 0 ? debe : null,
    haber: haber >= 0 ? haber : null,
    monto: monto >= 0 ? monto : debe >= 0 ? null : 3,
    cuenta: cuenta >= 0 ? cuenta : 4,
    saldo: saldo >= 0 ? saldo : null,
  }
}

export function parseArgAmount(val: string | number | null | undefined): number {
  if (val == null || val === "") return 0
  if (typeof val === "number") return Math.round(val * 100)
  const s = String(val).trim()
  let clean: string
  if (/\.\d{2}$/.test(s)) {
    // US format: dot=decimal, comma=thousands (e.g. "2,933,895.97")
    clean = s.replace(/,/g, "")
  } else if (/,\d{2}$/.test(s)) {
    // AR format: comma=decimal, dot=thousands (e.g. "2.933.895,97")
    clean = s.replace(/\./g, "").replace(",", ".")
  } else {
    // Integer or no recognizable decimal — strip all separators
    clean = s.replace(/[.,]/g, "")
  }
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

export function parseDate(val: string | number | Date | null | undefined): string {
  if (!val) return ""
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10)
  }
  const s = String(val).trim()
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

export async function parseTangoExcel(buffer: ArrayBuffer): Promise<Asiento[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]

  const rows: ExcelJS.Row[] = []
  sheet.eachRow((row) => rows.push(row))

  if (rows.length === 0) return []

  // Try to detect columns from first row
  const firstVals = rows[0].values as (string | number | null | undefined)[]
  const colMap = detectColumns(firstVals.slice(1)) // slice(1) because exceljs vals are 1-indexed

  const startRow = 1 // skip header

  const asientos: Asiento[] = []

  for (let i = startRow; i < rows.length; i++) {
    const vals = rows[i].values as (string | number | Date | null | undefined)[]
    // vals are 1-indexed in exceljs
    const get = (colIdx: number) => vals[colIdx + 1] // +1 because colMap is 0-indexed, exceljs is 1-indexed

    const fecha = parseDate(get(colMap.fecha))
    const descripcion = String(get(colMap.descripcion) ?? "").trim()
    const referencia = String(get(colMap.referencia) ?? "").trim()
    const cuenta = String(get(colMap.cuenta) ?? "").trim()

    let debeVal: number | undefined
    let haberVal: number | undefined
    let monto = 0
    if (colMap.debe !== null && colMap.haber !== null) {
      debeVal = parseArgAmount(get(colMap.debe) as string | number)
      haberVal = parseArgAmount(get(colMap.haber) as string | number)
      // debe y haber son mutuamente exclusivos: si debe > 0 usamos debe (ingreso), si no usamos -haber (egreso)
      monto = debeVal !== 0 ? debeVal : -haberVal
    } else if (colMap.monto !== null) {
      monto = parseArgAmount(get(colMap.monto) as string | number)
    }

    const saldoVal = colMap.saldo !== null
      ? parseArgAmount(get(colMap.saldo) as string | number)
      : undefined

    if (!fecha || isNaN(monto)) continue
    if (!descripcion && monto === 0) continue

    asientos.push({
      id: crypto.randomUUID(),
      fecha,
      descripcion,
      referencia,
      monto,
      cuenta,
      ...(debeVal !== undefined ? { debe: debeVal } : {}),
      ...(haberVal !== undefined ? { haber: haberVal } : {}),
      ...(saldoVal !== undefined ? { saldo: saldoVal } : {}),
    })
  }

  return asientos
}

// RFC-4180 CSV parser — handles quoted fields with commas inside
function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === delim && !inQ) {
      out.push(cur.trim()); cur = ""
    } else {
      cur += c
    }
  }
  out.push(cur.trim())
  return out
}

export async function parseTangoCsv(buffer: ArrayBuffer): Promise<Asiento[]> {
  const text = Buffer.from(buffer).toString("utf8")
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []

  const delimiter = lines[0].includes(";") ? ";" : ","
  const parse = (line: string) => parseCsvLine(line, delimiter)

  const headers = parse(lines[0])
  const colMap = detectColumns(headers)

  const asientos: Asiento[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parse(lines[i])
    const get = (idx: number) => cols[idx] ?? ""

    const fecha = parseDate(get(colMap.fecha))
    const descripcion = get(colMap.descripcion).trim()
    const referencia = get(colMap.referencia).trim()
    const cuenta = get(colMap.cuenta).trim()

    let debeVal: number | undefined
    let haberVal: number | undefined
    let monto = 0
    if (colMap.debe !== null && colMap.haber !== null) {
      debeVal = parseArgAmount(get(colMap.debe))
      haberVal = parseArgAmount(get(colMap.haber))
      monto = debeVal !== 0 ? debeVal : -haberVal
    } else if (colMap.monto !== null) {
      monto = parseArgAmount(get(colMap.monto))
    }

    const saldoVal = colMap.saldo !== null
      ? parseArgAmount(get(colMap.saldo))
      : undefined

    if (!fecha || (!descripcion && monto === 0)) continue
    asientos.push({
      id: crypto.randomUUID(),
      fecha,
      descripcion,
      referencia,
      monto,
      cuenta,
      ...(debeVal !== undefined ? { debe: debeVal } : {}),
      ...(haberVal !== undefined ? { haber: haberVal } : {}),
      ...(saldoVal !== undefined ? { saldo: saldoVal } : {}),
    })
  }
  return asientos
}

