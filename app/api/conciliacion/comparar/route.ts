import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sessionExists } from "@/lib/sessions/manager"
import { conciliar } from "@/lib/conciliacion/matching"
import { upsertConciliacion, getConciliacion } from "@/lib/conciliacion/registry"
import { getPartidas } from "@/lib/partidas/manager"
import { generateJSONOpenAI } from "@/lib/ai/client"
import { db } from "@/lib/db"
import { movimientos as movimientosTable, asientos as asientosTable, matches as matchesTable, discrepancias as discrepanciasTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { Movimiento, Asiento, Match, Discrepancia } from "@/lib/types"

const SugerenciaSchema = z.object({
  sugerencias: z.array(z.object({
    movimientoId: z.string(),
    asientoId: z.string().nullable(),
    confidence: z.number().min(0).max(100),
    explicacion: z.string(),
    diferenciaMonto: z.number().optional(), // centavos, si los montos difieren
  }))
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sessionId } = body as { sessionId?: string }

  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
  if (!(await sessionExists(sessionId))) {
    return NextResponse.json({ error: "Sesión no encontrada o expirada" }, { status: 404 })
  }

  // Load from DB
  const movimientosRows = await db.select().from(movimientosTable).where(eq(movimientosTable.conciliacionId, sessionId))
  const asientosRows = await db.select().from(asientosTable).where(eq(asientosTable.conciliacionId, sessionId))

  if (movimientosRows.length === 0) {
    return NextResponse.json({ error: "Extracto bancario no encontrado. Completá el paso anterior." }, { status: 400 })
  }
  if (asientosRows.length === 0) {
    return NextResponse.json({ error: "Mayor de Tango no encontrado. Completá el paso anterior." }, { status: 400 })
  }

  const movimientos: Movimiento[] = movimientosRows.map(r => ({
    id: r.id, fecha: r.fecha, descripcion: r.descripcion, referencia: r.referencia,
    monto: r.monto, saldo: r.saldo ?? undefined, categoria: r.categoria as Movimiento["categoria"],
  }))
  const asientos: Asiento[] = asientosRows.map(r => ({
    id: r.id, fecha: r.fecha, descripcion: r.descripcion, referencia: r.referencia,
    monto: r.monto, cuenta: r.cuenta, debe: r.debe ?? undefined, haber: r.haber ?? undefined, saldo: r.saldo ?? undefined,
  }))

  try {
    const conc = await getConciliacion(sessionId)
    const saldoFinalExtracto = conc?.saldoFinal
    const bankId = conc?.bankId ?? ""
    const partidas = bankId ? await getPartidas(bankId) : []
    const sumaPartidas = partidas.reduce((s, p) => s + p.monto, 0)
    const saldoMayorRegistrado = conc?.saldoMayor

    // ── FASE 1: matching determinístico ──────────────────────────────────
    const fase1 = conciliar(movimientos, asientos, saldoFinalExtracto, sumaPartidas, saldoMayorRegistrado)
    const confirmedMovIds = new Set(fase1.matches.map(m => m.movimientoId))
    const confirmedAsiIds = new Set(fase1.matches.map(m => m.asientoId))

    const unmatchedMovimientos = movimientos.filter(m => !confirmedMovIds.has(m.id))
    const unmatchedAsientos = asientos.filter(a => !confirmedAsiIds.has(a.id))

    // ── FASE 2: LLM para items sin match ─────────────────────────────────
    const probableMatches: Match[] = []
    const llmDiscrepancias = { banco: unmatchedMovimientos, tango: unmatchedAsientos }

    if (unmatchedMovimientos.length > 0 && unmatchedAsientos.length > 0) {
      try {
        const prompt = `Tenés estos movimientos del banco sin conciliar:
${unmatchedMovimientos.map(m => `- id:${m.id} fecha:${m.fecha} monto:${m.monto} desc:"${m.descripcion}"`).join("\n")}

Y estos asientos del mayor Tango sin conciliar:
${unmatchedAsientos.map(a => `- id:${a.id} fecha:${a.fecha} monto:${a.monto} desc:"${a.descripcion}" cuenta:${a.cuenta}`).join("\n")}

Para cada movimiento bancario, buscá el asiento de Tango que probablemente sea la misma operación. Las descripciones pueden ser completamente distintas pero el monto y fecha cercana son la pista principal. Si los montos difieren levemente (comisiones, retenciones), indicá la diferencia en centavos. Si no encontrás match razonable, asientoId = null.`

        const result = await generateJSONOpenAI(prompt, SugerenciaSchema,
          "Sos un contador argentino experto en conciliación bancaria. Analizá movimientos banco vs mayor Tango y sugerí matches aunque las descripciones difieran. Sé conservador: si no estás seguro (confidence < 70), devolvé null.",
          "matching")

        for (const sug of result.sugerencias) {
          if (!sug.asientoId || sug.confidence < 70) continue
          // Evitar usar el mismo asiento dos veces
          if (confirmedAsiIds.has(sug.asientoId)) continue
          confirmedAsiIds.add(sug.asientoId)
          confirmedMovIds.add(sug.movimientoId)
          probableMatches.push({
            movimientoId: sug.movimientoId,
            asientoId: sug.asientoId,
            score: sug.confidence,
            motivo: "Sugerido por IA",
            tipo: "probable",
            diferenciaMonto: sug.diferenciaMonto,
            explicacion: sug.explicacion,
          })
        }
      } catch (err) {
        // LLM fallback: si OpenAI falla, los items quedan como discrepancias
        console.warn("[comparar] LLM matching skipped:", err instanceof Error ? err.message : err)
      }
    }

    // ── FASE 3: discrepancias reales ──────────────────────────────────────
    const discrepancias: Discrepancia[] = [
      ...movimientos.filter(m => !confirmedMovIds.has(m.id)).map(m => ({
        tipo: "en_extracto_no_en_mayor" as const,
        fecha: m.fecha, descripcion: m.descripcion, monto: m.monto, movimientoId: m.id,
      })),
      ...asientos.filter(a => !confirmedAsiIds.has(a.id)).map(a => ({
        tipo: "en_mayor_no_en_extracto" as const,
        fecha: a.fecha, descripcion: a.descripcion, monto: a.monto, asientoId: a.id,
      })),
    ]

    const allMatches = [...fase1.matches, ...probableMatches]

    // ── Persist ───────────────────────────────────────────────────────────
    await db.delete(matchesTable).where(eq(matchesTable.conciliacionId, sessionId))
    await db.delete(discrepanciasTable).where(eq(discrepanciasTable.conciliacionId, sessionId))

    if (allMatches.length > 0) {
      await db.insert(matchesTable).values(allMatches.map(m => ({
        conciliacionId: sessionId,
        movimientoId: m.movimientoId,
        asientoId: m.asientoId,
        score: m.score,
        motivo: m.motivo,
        tipo: m.tipo,
        diferenciaMonto: m.diferenciaMonto ?? null,
        explicacion: m.explicacion ?? null,
      })))
    }
    if (discrepancias.length > 0) {
      await db.insert(discrepanciasTable).values(discrepancias.map(d => ({
        conciliacionId: sessionId,
        tipo: d.tipo,
        fecha: d.fecha,
        descripcion: d.descripcion,
        monto: d.monto,
        movimientoId: d.movimientoId ?? null,
        asientoId: d.asientoId ?? null,
      })))
    }

    // Use fase1 result for financial formula (includes all matches in formula logic)
    const resultado = {
      ...fase1,
      matches: allMatches,
      discrepancias,
    }

    await upsertConciliacion(sessionId, {
      stage: "done",
      saldoBanco: resultado.saldoBanco,
      diferencia: resultado.diferencia,
    })

    return NextResponse.json(resultado)
  } catch (err) {
    console.error("[comparar/route] Conciliation error:", err)
    return NextResponse.json({ error: "Error ejecutando la conciliación" }, { status: 500 })
  }
}
