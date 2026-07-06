import { NextRequest, NextResponse } from "next/server"
import { getConciliacion } from "@/lib/conciliacion/registry"
import { getPartidas } from "@/lib/partidas/manager"
import { db } from "@/lib/db"
import { movimientos as movimientosTable, asientos as asientosTable, matches as matchesTable, discrepancias as discrepanciasTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { Movimiento, Asiento, Match, Discrepancia } from "@/lib/types"

// Reconstruye el estado completo de una conciliación desde la DB.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId")
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })

  const [entry, movimientosRows, asientosRows, matchesRows, discrepanciasRows] = await Promise.all([
    getConciliacion(sessionId),
    db.select().from(movimientosTable).where(eq(movimientosTable.conciliacionId, sessionId)),
    db.select().from(asientosTable).where(eq(asientosTable.conciliacionId, sessionId)),
    db.select().from(matchesTable).where(eq(matchesTable.conciliacionId, sessionId)),
    db.select().from(discrepanciasTable).where(eq(discrepanciasTable.conciliacionId, sessionId)),
  ])
  if (!entry) return NextResponse.json({ error: "Conciliación no encontrada" }, { status: 404 })

  const movimientos: Movimiento[] = movimientosRows.map(r => ({
    id: r.id, fecha: r.fecha, descripcion: r.descripcion, referencia: r.referencia,
    monto: r.monto, saldo: r.saldo ?? undefined, categoria: r.categoria as Movimiento["categoria"],
  }))
  const asientos: Asiento[] = asientosRows.map(r => ({
    id: r.id, fecha: r.fecha, descripcion: r.descripcion, referencia: r.referencia,
    monto: r.monto, cuenta: r.cuenta, debe: r.debe ?? undefined, haber: r.haber ?? undefined, saldo: r.saldo ?? undefined,
  }))
  const matches: Match[] = matchesRows.map(r => ({
    id: r.id,
    movimientoId: r.movimientoId,
    asientoId: r.asientoId,
    score: r.score,
    motivo: r.motivo,
    tipo: r.tipo as Match["tipo"],
    diferenciaMonto: r.diferenciaMonto ?? undefined,
    explicacion: r.explicacion ?? undefined,
  }))
  const discrepancias: Discrepancia[] = discrepanciasRows.map(r => ({
    tipo: r.tipo as Discrepancia["tipo"],
    fecha: r.fecha,
    descripcion: r.descripcion,
    monto: r.monto,
    movimientoId: r.movimientoId ?? undefined,
    asientoId: r.asientoId ?? undefined,
  }))

  let resultado = null
  if (entry.stage === "done" && entry.saldoBanco != null) {
    const bankId = entry.bankId ?? ""
    const partidas = bankId ? await getPartidas(bankId) : []
    const sumaPartidas = partidas.reduce((s, p) => s + p.monto, 0)

    const confirmedAndProbableMatches = matches.filter(m => m.tipo !== "rejected")
    const confirmedIds = new Set(confirmedAndProbableMatches.flatMap(m => [m.movimientoId, m.asientoId]))

    const conceptosPendientes = discrepancias
      .filter(d => d.tipo === "en_extracto_no_en_mayor")
      .reduce((s, d) => s + d.monto, 0)
    const conceptosPendientesTango = discrepancias
      .filter(d => d.tipo === "en_mayor_no_en_extracto")
      .reduce((s, d) => s + d.monto, 0)

    const saldoBanco = entry.saldoBanco
    const saldoMayor = entry.saldoMayor ?? 0
    const diferencia = saldoBanco - saldoMayor - conceptosPendientes + conceptosPendientesTango

    resultado = {
      matches: confirmedAndProbableMatches,
      discrepancias,
      movimientos,
      asientos,
      saldoBanco,
      saldoMayor,
      conceptosPendientes,
      conceptosPendientesTango,
      diferencia,
      candidatosAConciliarIds: [] as string[],
      sumaPartidas,
      diferenciaAjustada: diferencia - sumaPartidas,
    }
  }

  return NextResponse.json({
    ...entry,
    bank: entry.bankId
      ? { bankId: entry.bankId, bankName: entry.bankName ?? "", confidence: entry.confidence ?? "low" }
      : null,
    movimientos,
    asientos,
    resultado,
  })
}
