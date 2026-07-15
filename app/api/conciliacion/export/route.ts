import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { getConciliacion } from "@/lib/conciliacion/registry"
import { getPartidas } from "@/lib/partidas/manager"
import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { requireOrgId } from "@/lib/auth/current-user"
import { and, eq } from "drizzle-orm"
import { agruparPorCategoria } from "@/lib/conciliacion/agrupar-categorias"
import { explicarGap } from "@/lib/conciliacion/explicar-gap"
import { calcularFinanzas } from "@/lib/conciliacion/matching"
import { cargarMovimientosActivos } from "@/lib/conciliacion/movimientos-activos"
import type { Discrepancia } from "@/lib/types"

const money = "#,##0.00"
const pesos = (c: number) => c / 100

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId")
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })

  let orgId: string
  try {
    orgId = await requireOrgId()
  } catch {
    return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
  }

  const [entry, data, { movimientos: movRows, sumaDiferidos }] = await Promise.all([
    getConciliacion(sessionId, orgId),
    db.query.conciliaciones.findFirst({
      where: and(eq(conciliaciones.id, sessionId), eq(conciliaciones.orgId, orgId)),
      with: {
        asientos: true,
        matches: { with: { movimiento: true, asiento: true } },
        discrepancias: { with: { movimiento: true } },
      },
    }),
    cargarMovimientosActivos(sessionId),
  ])
  if (!entry || !data) return NextResponse.json({ error: "Conciliación no encontrada" }, { status: 404 })
  const asiRows = data.asientos
  const matchRows = data.matches

  const discrepancias: Discrepancia[] = data.discrepancias.map(r => ({
    id: r.id,
    tipo: r.tipo as Discrepancia["tipo"],
    fecha: r.fecha,
    descripcion: r.descripcion,
    monto: r.monto,
    movimientoId: r.movimientoId ?? undefined,
    asientoId: r.asientoId ?? undefined,
    categoria: r.movimiento?.categoria as Discrepancia["categoria"],
    grupoId: r.movimiento?.grupoId ?? undefined,
    bucketOverride: r.bucketOverride ?? undefined,
    revisar: r.revisar ?? false,
  }))

  const partidas = entry.bankId ? await getPartidas(entry.bankId, orgId) : []
  const sumaPartidas = partidas.reduce((s, p) => s + p.monto, 0) + sumaDiferidos
  // Netos del período desde las filas (no del header) — ver matching.ts
  const { saldoBanco, saldoMayor } = calcularFinanzas(movRows, asiRows, discrepancias, sumaPartidas)
  const explic = explicarGap(discrepancias, saldoBanco - saldoMayor, sumaPartidas)
  const secciones = agruparPorCategoria(discrepancias)

  const wb = new ExcelJS.Workbook()
  wb.creator = "RyM Agente"

  // ── Hoja Resumen ──
  const resumen = wb.addWorksheet("Resumen")
  resumen.columns = [{ width: 42 }, { width: 20 }]
  const titulo = resumen.addRow([`Conciliación — ${entry.bankName ?? "Banco"} · ${entry.label}`])
  titulo.font = { bold: true, size: 14 }
  resumen.addRow([])
  const addKV = (k: string, c: number, bold = false) => {
    const r = resumen.addRow([k, pesos(c)])
    r.getCell(2).numFmt = money
    if (bold) r.font = { bold: true }
    return r
  }
  addKV("Banco — neto del período", saldoBanco)
  addKV("Mayor — neto del período", saldoMayor)
  addKV("Diferencia a explicar (Banco − Mayor)", saldoBanco - saldoMayor)
  const totalRow = addKV("TOTAL A CONCILIAR", explic.totalExplicado, true)
  totalRow.getCell(1).font = { bold: true, size: 12 }
  resumen.addRow([explic.cuadra ? "Estado: ✓ CUADRA" : "Estado: Residual sin explicar", explic.cuadra ? 0 : pesos(explic.residual)])
    .getCell(2).numFmt = money
  resumen.addRow([])
  const hCat = resumen.addRow(["Categoría", "Total"])
  hCat.font = { bold: true }
  hCat.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } } })
  for (const s of secciones) {
    const r = resumen.addRow([`${s.categoria} (${s.count})`, pesos(s.total)])
    r.getCell(2).numFmt = money
  }

  // ── Hoja Detalle (por categoría) ──
  const detalle = wb.addWorksheet("Detalle")
  detalle.columns = [
    { header: "Categoría", width: 26 },
    { header: "Fecha", width: 12 },
    { header: "Descripción", width: 44 },
    { header: "Lado", width: 10 },
    { header: "Monto", width: 18, style: { numFmt: money } },
    { header: "Revisar", width: 10 },
  ]
  detalle.getRow(1).font = { bold: true }
  detalle.getRow(1).eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } } })
  for (const s of secciones) {
    for (const d of s.items) {
      detalle.addRow([
        s.categoria,
        d.fecha,
        d.descripcion,
        d.tipo === "en_extracto_no_en_mayor" ? "banco" : "mayor",
        pesos(d.monto),
        d.revisar ? "SÍ" : "",
      ])
    }
    const sub = detalle.addRow([`Subtotal ${s.categoria}`, "", "", "", pesos(s.total), ""])
    sub.font = { bold: true }
    sub.getCell(5).numFmt = money
  }

  // ── Hoja Conciliados ──
  const conc = wb.addWorksheet("Conciliados")
  conc.columns = [
    { header: "Fecha", width: 12 },
    { header: "Descripción Banco", width: 40 },
    { header: "Descripción Tango", width: 40 },
    { header: "Monto", width: 18, style: { numFmt: money } },
    { header: "Score", width: 8 },
  ]
  conc.getRow(1).font = { bold: true }
  for (const m of matchRows.filter(m => m.tipo !== "rejected")) {
    conc.addRow([m.movimiento?.fecha ?? "", m.movimiento?.descripcion ?? "", m.asiento?.descripcion ?? "", pesos(m.movimiento?.monto ?? 0), m.score])
  }

  const buffer = await wb.xlsx.writeBuffer()
  // Slug ASCII consistente para ambos segmentos: acentos→base, no-alfanumérico→"-".
  // Evita que "/", comillas o ñ/é rompan el filename del Content-Disposition.
  const slug = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
  const nombre = `conciliacion-${slug(entry.bankName ?? "banco")}-${slug(entry.label)}.xlsx`
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  })
}
