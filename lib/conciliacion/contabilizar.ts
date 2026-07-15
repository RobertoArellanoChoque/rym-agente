import { db } from "@/lib/db"
import { asientos as asientosTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { conciliar, centavosAString, TOLERANCIA_CUADRE } from "@/lib/conciliacion/matching"
import { upsertConciliacion, getConciliacion } from "@/lib/conciliacion/registry"
import { reemplazarMatchesYDiscrepancias } from "@/lib/conciliacion/persist"
import { rowToAsiento } from "@/lib/conciliacion/mappers"
import { cargarMovimientosActivos } from "@/lib/conciliacion/movimientos-activos"
import { requireOrgId } from "@/lib/auth/current-user"
import { audit } from "@/lib/audit"
import crypto from "crypto"
import type { Movimiento, Asiento } from "@/lib/types"

export type ContabilizarResult =
  | { ok: true; asientosCreados: number; diferencia: string; hint?: string }
  | { error: string; diferencia?: string; hint?: string }

// Carga movimientos+asientos de una conciliación lista para contabilizar (stage "done").
// Compartido por contabilizarPendientes (muta) y evaluarContabilizar (read-only).
async function cargarParaContabilizar(
  sessionId: string
): Promise<{ error: string } | { movimientos: Movimiento[]; asientos: Asiento[]; sumaDiferidos: number }> {
  const orgId = await requireOrgId()

  const session = await getConciliacion(sessionId, orgId)
  if (!session) return { error: "Sesión no encontrada" }
  if (session.stage !== "done") return { error: `Stage actual: ${session.stage}. Ejecutá el matching primero.` }

  const [{ movimientos, sumaDiferidos }, asien] = await Promise.all([
    cargarMovimientosActivos(sessionId),
    db.select().from(asientosTable).where(eq(asientosTable.conciliacionId, sessionId)),
  ])
  return { movimientos, asientos: asien.map(rowToAsiento), sumaDiferidos }
}

/**
 * Contabiliza en el mayor los ítems pendientes de una conciliación para cerrarla
 * en diferencia 0. Crea asientos de ajuste ("AJUSTES DE CONCILIACIÓN") por ambos
 * lados. Solo cierra si el residual ya es ≈0 (los pendientes explican todo el gap).
 *
 * Mutación de estado financiero: se invoca SOLO desde el endpoint auth-gated
 * (click humano), nunca desde el agente LLM. Ver /cso F1.
 */
export async function contabilizarPendientes(sessionId: string): Promise<ContabilizarResult> {
  const orgId = await requireOrgId()
  const datos = await cargarParaContabilizar(sessionId)
  if ("error" in datos) return datos
  const { movimientos, asientos, sumaDiferidos } = datos

  const antes = conciliar(movimientos, asientos, sumaDiferidos)

  // Guardia de honestidad: si el residual excede la tolerancia de redondeo,
  // los pendientes NO explican todo el gap → no se puede cerrar en 0. No booking.
  if (Math.abs(antes.diferencia) > TOLERANCIA_CUADRE) {
    return {
      error: "No se puede cerrar en 0: hay diferencia residual sin explicar.",
      diferencia: centavosAString(antes.diferencia),
      hint: "Revisá movimientos faltantes o cargá partidas de ajuste antes de contabilizar.",
    }
  }

  if (antes.discrepancias.length === 0) {
    return { ok: true, asientosCreados: 0, diferencia: centavosAString(0), hint: "Ya estaba conciliada sin pendientes." }
  }

  // Un asiento de ajuste por discrepancia. Banco-side = +monto; mayor-side = −monto. Cuenta puente fija.
  const nuevos = antes.discrepancias.map(d => {
    const banco = d.tipo === "en_extracto_no_en_mayor"
    return {
      id: crypto.randomUUID(),
      conciliacionId: sessionId,
      fecha: d.fecha,
      descripcion: `AJUSTE CONCILIACIÓN — ${d.descripcion}`,
      referencia: "",
      monto: banco ? d.monto : -d.monto,
      cuenta: "AJUSTES DE CONCILIACIÓN",
      debe: null as number | null,
      haber: null as number | null,
      saldo: null as number | null,
    }
  })

  const asientosDespues: Asiento[] = [
    ...asientos,
    ...nuevos.map(a => ({ id: a.id, fecha: a.fecha, descripcion: a.descripcion, referencia: a.referencia, monto: a.monto, cuenta: a.cuenta })),
  ]
  const despues = conciliar(movimientos, asientosDespues, sumaDiferidos)

  // Los 3 writes van en UNA transacción: un fallo parcial no deja el mayor a medias
  // (ajustes insertados con matches/registry viejos).
  // ponytail: sin lock de fila. Un doble-submit concurrente podría duplicar ajustes;
  // riesgo bajo (mutación solo por click humano, single-tenant). Si hace falta:
  // SELECT ... FOR UPDATE sobre la conciliación al entrar, o idempotency key.
  await db.transaction(async (tx) => {
    await tx.insert(asientosTable).values(nuevos)
    await reemplazarMatchesYDiscrepancias(sessionId, despues.matches, despues.discrepancias, tx)
    await upsertConciliacion(sessionId, {
      stage: "done",
      asientosCount: asientosDespues.length,
      saldoMayor: despues.saldoMayor,
      diferencia: despues.diferencia,
    }, orgId, tx)
  })

  await audit("contabilizar", "conciliacion", sessionId, {
    asientosCreados: nuevos.length,
    diferencia: centavosAString(despues.diferencia),
  })

  return {
    ok: true,
    asientosCreados: nuevos.length,
    diferencia: centavosAString(despues.diferencia),
    hint: Math.abs(despues.diferencia) <= TOLERANCIA_CUADRE ? "Conciliación cerrada en 0. Aprobala desde el panel." : undefined,
  }
}

/**
 * Validación read-only para el agente LLM: computa el estado sin mutar nada.
 * El agente propone; el humano confirma con el botón (endpoint auth-gated).
 */
export async function evaluarContabilizar(sessionId: string): Promise<
  | { pendienteConfirmacion: true; asientosAProponer: number; diferencia: string; mensaje: string }
  | { error: string; diferencia?: string; hint?: string }
> {
  const datos = await cargarParaContabilizar(sessionId)
  if ("error" in datos) return datos
  const { movimientos, asientos, sumaDiferidos } = datos

  const antes = conciliar(movimientos, asientos, sumaDiferidos)
  if (Math.abs(antes.diferencia) > TOLERANCIA_CUADRE) {
    return {
      error: "No se puede cerrar en 0: hay diferencia residual sin explicar.",
      diferencia: centavosAString(antes.diferencia),
      hint: "Revisá movimientos faltantes o cargá partidas de ajuste.",
    }
  }
  return {
    pendienteConfirmacion: true,
    asientosAProponer: antes.discrepancias.length,
    diferencia: centavosAString(antes.diferencia),
    mensaje: "Confirmá con el botón 'Contabilizar pendientes' en la conciliación.",
  }
}

// ── self-check ──  ./node_modules/.bin/tsx lib/conciliacion/contabilizar.ts
if (process.argv[1] && process.argv[1].endsWith("contabilizar.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  // Sin DB real: verificamos que los símbolos existen y son funciones async.
  assert(typeof contabilizarPendientes === "function", "contabilizarPendientes exportada")
  assert(typeof evaluarContabilizar === "function", "evaluarContabilizar exportada")
  assert(contabilizarPendientes.constructor.name === "AsyncFunction", "contabilizar es async")
  assert(evaluarContabilizar.constructor.name === "AsyncFunction", "evaluar es async")
  console.log("OK contabilizar.ts — símbolos y firmas correctas")
}
