import { tool } from "ai"
import { z } from "zod"
import { db } from "@/lib/db"
import { conciliaciones, asientos as asientosTable, discrepancias } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { conciliar } from "@/lib/conciliacion/matching"
import { upsertConciliacion, getConciliacion } from "@/lib/conciliacion/registry"
import { reemplazarMatchesYDiscrepancias } from "@/lib/conciliacion/persist"
import { rowToAsiento } from "@/lib/conciliacion/mappers"
import { cargarMovimientosActivos } from "@/lib/conciliacion/movimientos-activos"
import { centavosAString, TOLERANCIA_CUADRE } from "@/lib/conciliacion/matching"
import { evaluarContabilizar } from "@/lib/conciliacion/contabilizar"
import { currentUserId, requireOrgId } from "@/lib/auth/current-user"
import crypto from "crypto"
import type { Asiento } from "@/lib/types"

export const actionTools = {
  ejecutar_matching: tool({
    description:
      "Ejecuta el algoritmo de matching entre movimientos del extracto bancario y asientos del mayor de Tango. Guarda los matches encontrados, detecta discrepancias y calcula la diferencia. Requerido antes de aprobar una conciliación.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
      aprobarMatches: z.boolean().optional().describe("Si true, aprueba automáticamente todos los matches sin intervención del usuario. Default: false (solo calcula, no aprueba)."),
    }),
    execute: async ({ sessionId, aprobarMatches = false }) => {
      const orgId = await requireOrgId()
      // Verificar sesión existe
      const session = await getConciliacion(sessionId, orgId)
      if (!session) return { error: "Sesión no encontrada" }

      // Stage debe ser tango-done (banco + mayor cargados)
      if (session.stage !== "tango-done") {
        return { error: `Stage actual: ${session.stage}. Requerido: tango-done (extraer banco y mayor primero).` }
      }

      // Obtener movimientos (activos, sin los diferidos) y asientos — en paralelo
      const [{ movimientos }, asien] = await Promise.all([
        cargarMovimientosActivos(sessionId),
        db.select().from(asientosTable).where(eq(asientosTable.conciliacionId, sessionId)),
      ])

      if (movimientos.length === 0) return { error: "Sin movimientos cargados del extracto" }
      if (asien.length === 0) return { error: "Sin asientos cargados del mayor Tango" }

      const asientos: Asiento[] = asien.map(rowToAsiento)

      // Ejecutar matching
      const resultado = conciliar(movimientos, asientos)

      // Guardar matches + discrepancias en DB (atómico)
      const matchesToSave = aprobarMatches
        ? resultado.matches.map(m => ({ ...m, tipo: "confirmed" as const }))
        : resultado.matches
      await reemplazarMatchesYDiscrepancias(sessionId, matchesToSave, resultado.discrepancias)

      // Actualizar sesión
      await upsertConciliacion(sessionId, {
        stage: "done",
        movimientosCount: resultado.movimientos.length,
        asientosCount: resultado.asientos.length,
        saldoBanco: resultado.saldoBanco,
        saldoMayor: resultado.saldoMayor,
        diferencia: resultado.diferencia,
      }, orgId)

      return {
        ok: true,
        matches: resultado.matches.length,
        discrepancias: resultado.discrepancias.length,
        diferencia: centavosAString(resultado.diferencia),
        stage: "done",
      }
    },
  }),

  aprobar_conciliacion: tool({
    description:
      "PROPONE aprobar una conciliación. NO la aprueba: la aprobación es un paso que confirma el humano con el botón 'Aprobar' del panel derecho. Usá esto para verificar que está lista y avisarle al usuario.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
    }),
    // No muta estado financiero: solo valida y propone. La aprobación real
    // ocurre por click humano en TasksPanel → /api/tasks. Ver /cso F1.
    execute: async ({ sessionId }) => {
      const orgId = await requireOrgId()
      const session = await getConciliacion(sessionId, orgId)
      if (!session) return { error: "Sesión no encontrada" }
      if (session.stage !== "done") {
        return { error: `Stage actual: ${session.stage}. Ejecutá el matching primero (ejecutar_matching).` }
      }
      const dif = session.diferencia ?? 0
      return {
        pendienteConfirmacion: true,
        resumen: {
          sessionId,
          conciliacion: `${session.bankName ?? "?"} — ${session.label}`,
          diferencia: centavosAString(dif),
          cuadra: Math.abs(dif) <= TOLERANCIA_CUADRE,
        },
        mensaje: "Aprobá desde el panel derecho (botón 'Aprobar'). El agente no aprueba por su cuenta.",
      }
    },
  }),

  crear_sesion: tool({
    description:
      "Crea una nueva sesión de conciliación. Llamá esto antes de subir cualquier extracto bancario. Retorna el sessionId para usar en los demás endpoints.",
    inputSchema: z.object({
      label: z.string().describe("Nombre/descripción para la sesión, ej: 'BBVA Junio 2026' o 'Conciliación mensual'"),
      bankHint: z.string().optional().describe("Optional hint del banco si ya lo sabés, para auto-completar el label después. Ej: 'bbva', 'galicia'."),
    }),
    execute: async ({ label, bankHint }) => {
      const sessionId = crypto.randomUUID()
      const now = new Date().toISOString()
      const userId = await currentUserId()
      const orgId = await requireOrgId()

      await db.insert(conciliaciones).values({
        id: sessionId,
        label,
        stage: "new",
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
        orgId,
      })

      return {
        ok: true,
        sessionId,
        label,
        stage: "new",
        hint: "Próximo paso: subí el extracto bancario (PDF o Excel) con sessionId=" + sessionId,
      }
    },
  }),

  contabilizar_pendientes: tool({
    description:
      "PROPONE contabilizar los ítems pendientes de una conciliación (crear asientos de ajuste para cerrarla en 0). NO los contabiliza: eso lo confirma el humano con el botón 'Contabilizar pendientes' en la conciliación. Usá esto para verificar que cierra en 0 y avisarle al usuario cuántos asientos se crearían.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
    }),
    // No muta estado financiero: solo valida y propone. La contabilización real
    // ocurre por click humano → /api/conciliacion/contabilizar. Ver /cso F1.
    execute: async ({ sessionId }) => {
      return evaluarContabilizar(sessionId)
    },
  }),

  listar_discrepancias: tool({
    description:
      "Retorna todas las discrepancias encontradas en una conciliación (movimientos en extracto que no están en Tango y vice versa). Útil para diagnosticar diferencias.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
    }),
    execute: async ({ sessionId }) => {
      const orgId = await requireOrgId()
      const session = await getConciliacion(sessionId, orgId)
      if (!session) return { error: "Sesión no encontrada" }

      const rows = await db.select().from(discrepancias).where(eq(discrepancias.conciliacionId, sessionId))

      return {
        total: rows.length,
        discrepancias: rows.map(d => ({
          tipo: d.tipo,
          fecha: d.fecha,
          descripcion: d.descripcion,
          monto: centavosAString(d.monto),
        })),
      }
    },
  }),
}
