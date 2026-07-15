import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sessionExists } from "@/lib/sessions/manager"
import { conciliar, calcularFinanzas } from "@/lib/conciliacion/matching"
import { upsertConciliacion, getConciliacion } from "@/lib/conciliacion/registry"
import { reemplazarMatchesYDiscrepancias } from "@/lib/conciliacion/persist"
import { rowToAsiento } from "@/lib/conciliacion/mappers"
import { cargarMovimientosActivos } from "@/lib/conciliacion/movimientos-activos"
import { getPartidas } from "@/lib/partidas/manager"
import { generateJSONOpenAI } from "@/lib/ai/client"
import { rateLimit, ipOf } from "@/lib/rate-limit"
import { requireOrgId } from "@/lib/auth/current-user"
import { db } from "@/lib/db"
import {
  asientos as asientosTable,
  movimientos as movimientosTable,
  matches as matchesTable,
  conciliaciones as conciliacionesTable,
  movimientosDiferidos,
} from "@/lib/db/schema"
import { and, eq, inArray, desc } from "drizzle-orm"
import { aprenderAliases, firmasRechazadas, type ContextoAprendizaje } from "@/lib/conciliacion/aliases"
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
  if (!(await rateLimit(`ai:${ipOf(req)}`, 10, 60_000)))
    return NextResponse.json({ error: "Demasiadas solicitudes, esperá un momento" }, { status: 429 })
  const body = await req.json().catch(() => ({}))
  const { sessionId } = body as { sessionId?: string }

  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })

  let orgId: string
  try {
    orgId = await requireOrgId()
  } catch {
    return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
  }

  try {
    if (!(await sessionExists(sessionId))) {
      return NextResponse.json({ error: "Sesión no encontrada o expirada" }, { status: 404 })
    }

    // Ownership check PRIMERO y en serie (no en el Promise.all de abajo): movimientos/
    // asientos se cargan por sessionId sin filtro propio de orgId (confían en el caller),
    // así que si no cortamos acá antes de leerlos, un sessionId de otra org devolvería
    // sus movimientos/asientos y — peor — reemplazarMatchesYDiscrepancias + upsertConciliacion
    // más abajo reescribirían los datos de esa org.
    const conc = await getConciliacion(sessionId, orgId)
    if (!conc) return NextResponse.json({ error: "Conciliación no encontrada" }, { status: 404 })

    // Load from DB — 2 lecturas independientes por sessionId, en paralelo
    const [movActivos, asientosRows] = await Promise.all([
      cargarMovimientosActivos(sessionId),
      db.select().from(asientosTable).where(eq(asientosTable.conciliacionId, sessionId)),
    ])
    const { movimientos: movimientosActivos, sumaDiferidos } = movActivos

    if (movimientosActivos.length === 0) {
      return NextResponse.json({ error: "Extracto bancario no encontrado. Completá el paso anterior." }, { status: 400 })
    }
    if (asientosRows.length === 0) {
      return NextResponse.json({ error: "Mayor de Tango no encontrado. Completá el paso anterior." }, { status: 400 })
    }

    const asientos: Asiento[] = asientosRows.map(rowToAsiento)

    // Movimientos de este extracto ya vinculados como destino de un diferido
    // resuelto (ver PATCH /api/conciliacion/diferidos): el usuario ya los marcó
    // "conciliado" contra el diferido de un período anterior — no deben volver a
    // generar su propia discrepancia acá. Mismo tratamiento que un diferido
    // normal: se excluyen del matching y su monto pasa a sumaPartidas (ya está explicado).
    const movActivosIds = movimientosActivos.map(m => m.id)
    const diferidosResueltos = movActivosIds.length > 0
      ? await db.select().from(movimientosDiferidos).where(and(
          eq(movimientosDiferidos.estado, "conciliado"),
          inArray(movimientosDiferidos.conciliadoEnMovimientoId, movActivosIds),
        ))
      : []
    const resueltosIds = new Set(
      diferidosResueltos.map(d => d.conciliadoEnMovimientoId).filter((id): id is string => id != null)
    )
    const sumaResueltos = diferidosResueltos.reduce((s, d) => s + d.monto, 0)
    const movimientos: Movimiento[] = movimientosActivos.filter(m => !resueltosIds.has(m.id))

    const bankId = conc?.bankId ?? ""
    const partidas = bankId ? await getPartidas(bankId, orgId) : []
    const sumaPartidas = partidas.reduce((s, p) => s + p.monto, 0) + sumaDiferidos + sumaResueltos

    // ── Contexto de aprendizaje: decisiones humanas (matches origen='manual') del
    // mismo banco+org. Defensivo: si el aprendizaje falla, seguimos sin contexto
    // (comportamiento idéntico al motor base). ──────────────────────────────
    let contexto: ContextoAprendizaje | undefined
    try {
      if (bankId) {
        const historial = await db
          .select({
            tipo: matchesTable.tipo,
            descBanco: movimientosTable.descripcion,
            descTango: asientosTable.descripcion,
          })
          .from(matchesTable)
          .innerJoin(conciliacionesTable, eq(matchesTable.conciliacionId, conciliacionesTable.id))
          .innerJoin(movimientosTable, eq(matchesTable.movimientoId, movimientosTable.id))
          .innerJoin(asientosTable, eq(matchesTable.asientoId, asientosTable.id))
          .where(and(
            eq(matchesTable.origen, "manual"),
            eq(conciliacionesTable.orgId, orgId),
            eq(conciliacionesTable.bancoId, bankId),
          ))
          .orderBy(desc(matchesTable.id))
          .limit(500)

        const confirmados = historial.filter(h => h.tipo === "confirmed")
        const rechazados = historial.filter(h => h.tipo === "rejected")
        if (confirmados.length > 0 || rechazados.length > 0) {
          contexto = {
            aliases: aprenderAliases(confirmados),
            rechazados: firmasRechazadas(rechazados),
          }
        }
      }
    } catch (err) {
      console.warn("[comparar] learning context skipped:", err instanceof Error ? err.message : err)
      contexto = undefined
    }

    // ── FASE 1: matching determinístico ──────────────────────────────────
    const fase1 = conciliar(movimientos, asientos, sumaPartidas, contexto)
    const confirmedMovIds = new Set(fase1.matches.map(m => m.movimientoId))
    const confirmedAsiIds = new Set(fase1.matches.map(m => m.asientoId))

    const unmatchedMovimientos = movimientos.filter(m => !confirmedMovIds.has(m.id))
    const unmatchedAsientos = asientos.filter(a => !confirmedAsiIds.has(a.id))

    // ── FASE 2: LLM para items sin match ─────────────────────────────────
    const probableMatches: Match[] = []

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
        categoria: m.categoria, grupoId: m.grupoId,
      })),
      ...asientos.filter(a => !confirmedAsiIds.has(a.id)).map(a => ({
        tipo: "en_mayor_no_en_extracto" as const,
        fecha: a.fecha, descripcion: a.descripcion, monto: a.monto, asientoId: a.id,
      })),
    ]

    const allMatches = [...fase1.matches, ...probableMatches]

    // ── Persist (atómico) ─────────────────────────────────────────────────
    await reemplazarMatchesYDiscrepancias(sessionId, allMatches, discrepancias)

    // Recomputar finanzas sobre las discrepancias FINALES (post-LLM), no las de
    // fase1: fase2 puede matchear items que fase1 contaba como pendientes.
    const fin = calcularFinanzas(movimientos, asientos, discrepancias, sumaPartidas)
    const resultado = {
      ...fase1,
      ...fin,
      matches: allMatches,
      discrepancias,
      candidatosAConciliarIds: fin.diferencia !== 0 ? fase1.candidatosAConciliarIds : [],
    }

    await upsertConciliacion(sessionId, {
      stage: "done",
      saldoBanco: resultado.saldoBanco, // neto período (ver calcularFinanzas)
      saldoMayor: resultado.saldoMayor, // neto período — sobrescribe el cierre del stage tango
      diferencia: resultado.diferencia,
    }, orgId)

    return NextResponse.json(resultado)
  } catch (err) {
    console.error("[comparar/route] Conciliation error:", err)
    return NextResponse.json({ error: "Error ejecutando la conciliación" }, { status: 500 })
  }
}
