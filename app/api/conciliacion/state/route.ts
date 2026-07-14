import { NextRequest, NextResponse } from "next/server"
import { getConciliacion } from "@/lib/conciliacion/registry"
import { calcularFinanzas } from "@/lib/conciliacion/matching"
import { getPartidas } from "@/lib/partidas/manager"
import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { rowToAsiento } from "@/lib/conciliacion/mappers"
import { cargarMovimientosActivos } from "@/lib/conciliacion/movimientos-activos"
import { eq } from "drizzle-orm"
import type { Asiento, Match, Discrepancia } from "@/lib/types"

// Reconstruye el estado completo de una conciliación desde la DB.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId")
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })

  const [entry, conc, { movimientos, sumaDiferidos }] = await Promise.all([
    getConciliacion(sessionId),
    db.query.conciliaciones.findFirst({
      where: eq(conciliaciones.id, sessionId),
      with: {
        asientos: true,
        matches: true,
        discrepancias: { with: { movimiento: true } },
      },
    }),
    cargarMovimientosActivos(sessionId),
  ])
  if (!entry || !conc) return NextResponse.json({ error: "Conciliación no encontrada" }, { status: 404 })

  const asientos: Asiento[] = conc.asientos.map(rowToAsiento)
  const matches: Match[] = conc.matches.map(r => ({
    id: r.id,
    movimientoId: r.movimientoId,
    asientoId: r.asientoId,
    score: r.score,
    motivo: r.motivo,
    tipo: r.tipo as Match["tipo"],
    diferenciaMonto: r.diferenciaMonto ?? undefined,
    explicacion: r.explicacion ?? undefined,
  }))
  const discrepancias: Discrepancia[] = conc.discrepancias.map(r => ({
    id: r.id,
    tipo: r.tipo as Discrepancia["tipo"],
    fecha: r.fecha,
    descripcion: r.descripcion,
    monto: r.monto,
    movimientoId: r.movimientoId ?? undefined,
    asientoId: r.asientoId ?? undefined,
    // categoria/grupoId viven en movimientos; el nested `with` los trae directo
    categoria: r.movimiento?.categoria as Discrepancia["categoria"],
    grupoId: r.movimiento?.grupoId ?? undefined,
    bucketOverride: r.bucketOverride ?? undefined,
    revisar: r.revisar ?? false,
  }))

  let resultado = null
  if (entry.stage === "done" && entry.saldoBanco != null) {
    const bankId = entry.bankId ?? ""
    const partidas = bankId ? await getPartidas(bankId) : []
    const sumaPartidas = partidas.reduce((s, p) => s + p.monto, 0) + sumaDiferidos

    const confirmedAndProbableMatches = matches.filter(m => m.tipo !== "rejected")

    // Recomputa con la identidad de netos (calcularFinanzas), independiente del
    // header — ver matching.ts para por qué los saldos de cierre no van acá.
    const fin = calcularFinanzas(movimientos, asientos, discrepancias, sumaPartidas)

    resultado = {
      matches: confirmedAndProbableMatches,
      discrepancias,
      movimientos,
      asientos,
      ...fin,
      candidatosAConciliarIds: [] as string[],
      sumaPartidas,
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
