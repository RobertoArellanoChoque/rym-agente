import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { requireOrgId } from "@/lib/auth/current-user"
import { historicoMensual } from "@/lib/reportes/historico"

const money = "#,##0.00"
const pesos = (c: number) => c / 100
// Mismo slug ASCII que app/api/conciliacion/export/route.ts (para el filename del Content-Disposition).
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()

export async function GET(req: NextRequest) {
  let orgId: string
  try {
    orgId = await requireOrgId()
  } catch {
    return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const desde = sp.get("desde") ?? ""
  const hasta = sp.get("hasta") ?? ""
  const bancoId = sp.get("bancoId") || undefined
  const formato = sp.get("formato")
  if (!desde || !hasta) return NextResponse.json({ error: "desde y hasta requeridos (YYYY-MM)" }, { status: 400 })

  const data = await historicoMensual(orgId, desde, hasta, bancoId)

  if (formato !== "xlsx") return NextResponse.json(data)

  const wb = new ExcelJS.Workbook()
  wb.creator = "RyM Agente"

  const header = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } } })
  }

  // ── Hoja Resumen mensual (una fila por período) ──
  const resumen = wb.addWorksheet("Resumen mensual")
  resumen.columns = [
    { header: "Período", width: 14 },
    { header: "Conciliaciones", width: 16 },
    { header: "Saldo Banco", width: 18, style: { numFmt: money } },
    { header: "Saldo Mayor", width: 18, style: { numFmt: money } },
    { header: "Diferencia", width: 18, style: { numFmt: money } },
  ]
  header(resumen)
  for (const p of data.porPeriodo) {
    resumen.addRow([p.periodo, p.cantidad, pesos(p.totalSaldoBanco), pesos(p.totalSaldoMayor), pesos(p.totalDiferencia)])
  }

  // ── Hoja Por banco ──
  const porBanco = wb.addWorksheet("Por banco")
  porBanco.columns = [
    { header: "Banco", width: 30 },
    { header: "Conciliaciones", width: 16 },
    { header: "Saldo Banco", width: 18, style: { numFmt: money } },
    { header: "Saldo Mayor", width: 18, style: { numFmt: money } },
    { header: "Diferencia", width: 18, style: { numFmt: money } },
  ]
  header(porBanco)
  for (const b of data.porBanco) {
    porBanco.addRow([b.bancoNombre, b.cantidad, pesos(b.totalSaldoBanco), pesos(b.totalSaldoMayor), pesos(b.totalDiferencia)])
  }

  const buffer = await wb.xlsx.writeBuffer()
  const nombre = `historico-${slug(desde)}-${slug(hasta)}.xlsx`
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  })
}
